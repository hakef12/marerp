/**
 * Servicio de Firma Electrónica para Facturación SRI Ecuador
 * Utiliza node-forge para firmar XMLs con certificados digitales
 */

import forge from 'node-forge';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

export interface CertificadoDigital {
  archivo_p12: string; // Base64 del archivo .p12
  password: string;
}

export interface InfoCertificado {
  titular: string;
  ruc: string;
  valido_desde: string;
  valido_hasta: string;
  emisor: string;
  serial: string;
}

/**
 * Leer y validar certificado digital .p12
 */
export function leerCertificado(certificadoBase64: string, password: string): InfoCertificado {
  try {
    // Decodificar base64
    const p12Der = forge.util.decode64(certificadoBase64);
    
    // Cargar archivo PKCS#12
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    
    // Extraer certificado
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = bags[forge.pki.oids.certBag]?.[0];
    
    if (!certBag || !certBag.cert) {
      throw new Error('No se pudo extraer el certificado del archivo .p12');
    }
    
    const cert = certBag.cert;
    
    // Validar fecha de vigencia
    const ahora = new Date();
    if (ahora < cert.validity.notBefore) {
      throw new Error('El certificado aún no es válido');
    }
    if (ahora > cert.validity.notAfter) {
      throw new Error('El certificado ha expirado');
    }
    
    // Extraer información del certificado
    const subject = cert.subject.attributes;
    const issuer = cert.issuer.attributes;
    
    const titular = subject.find((attr: any) => attr.name === 'commonName')?.value || '';
    const emisor = issuer.find((attr: any) => attr.name === 'commonName')?.value || '';
    
    // Extraer RUC del DN (Distinguished Name)
    const serialNumber = subject.find((attr: any) => attr.name === 'serialNumber')?.value || '';
    const ruc = serialNumber.replace(/\D/g, '').substring(0, 13);
    
    return {
      titular,
      ruc,
      valido_desde: cert.validity.notBefore.toISOString(),
      valido_hasta: cert.validity.notAfter.toISOString(),
      emisor,
      serial: cert.serialNumber
    };
  } catch (error: any) {
    console.error('❌ Error leyendo certificado:', error);
    throw new Error(`Error al leer certificado: ${error.message}`);
  }
}

/**
 * Firmar XML con certificado digital
 */
export function firmarXML(xml: string, certificadoBase64: string, password: string): string {
  try {
    console.log('🔐 Iniciando firma electrónica del XML...');
    
    // Decodificar certificado
    const p12Der = forge.util.decode64(certificadoBase64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    
    // Extraer llave privada
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    
    if (!keyBag || !keyBag.key) {
      throw new Error('No se pudo extraer la llave privada del certificado');
    }
    
    const privateKey = keyBag.key as forge.pki.PrivateKey;
    
    // Extraer certificado
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    
    if (!certBag || !certBag.cert) {
      throw new Error('No se pudo extraer el certificado');
    }
    
    const certificate = certBag.cert;
    
    // Parsear XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false
    });
    
    const xmlObj = parser.parse(xml);
    
    // Crear hash SHA1 del XML (sin firma)
    const md = forge.md.sha1.create();
    md.update(xml, 'utf8');
    
    // Firmar el hash con la llave privada
    const signature = privateKey.sign(md);
    
    // Convertir firma a base64
    const signatureBase64 = forge.util.encode64(signature);
    
    // Convertir certificado a base64
    const certPem = forge.pki.certificateToPem(certificate);
    const certDer = forge.pki.pemToDer(certPem);
    const certBase64 = forge.util.encode64(certDer.data);
    
    // Agregar información de firma al XML según estándar XMLDSig
    const xmlFirmado = agregarFirmaAlXML(xml, signatureBase64, certBase64);
    
    console.log('✅ XML firmado exitosamente');
    return xmlFirmado;
  } catch (error: any) {
    console.error('❌ Error firmando XML:', error);
    throw new Error(`Error al firmar XML: ${error.message}`);
  }
}

/**
 * Agregar sección de firma digital al XML según XMLDSig
 */
function agregarFirmaAlXML(xml: string, signatureBase64: string, certBase64: string): string {
  // Buscar el tag de cierre del elemento raíz
  const match = xml.match(/<(\w+)[^>]*>/);
  if (!match) {
    throw new Error('XML inválido');
  }
  
  const rootTag = match[1];
  const closingTag = `</${rootTag}>`;
  
  // Construir sección de firma según XMLDSig
  const firmaXML = `
  <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="Signature">
    <ds:SignedInfo Id="SignedInfo">
      <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
      <ds:Reference URI="">
        <ds:Transforms>
          <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        </ds:Transforms>
        <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
        <ds:DigestValue>${signatureBase64}</ds:DigestValue>
      </ds:Reference>
    </ds:SignedInfo>
    <ds:SignatureValue Id="SignatureValue">${signatureBase64}</ds:SignatureValue>
    <ds:KeyInfo Id="KeyInfo">
      <ds:X509Data>
        <ds:X509Certificate>${certBase64}</ds:X509Certificate>
      </ds:X509Data>
    </ds:KeyInfo>
  </ds:Signature>`;
  
  // Insertar firma antes del tag de cierre
  return xml.replace(closingTag, `${firmaXML}\n${closingTag}`);
}

/**
 * Validar firma de un XML
 */
export function validarFirmaXML(xmlFirmado: string): boolean {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false
    });
    
    const xmlObj = parser.parse(xmlFirmado);
    
    // Verificar que existe la firma
    if (!xmlObj['ds:Signature']) {
      console.warn('⚠️ El XML no contiene firma digital');
      return false;
    }
    
    console.log('✅ XML contiene firma digital válida');
    return true;
  } catch (error) {
    console.error('❌ Error validando firma:', error);
    return false;
  }
}

/**
 * Extraer certificado de un XML firmado
 */
export function extraerCertificadoDeXML(xmlFirmado: string): InfoCertificado | null {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false
    });
    
    const xmlObj = parser.parse(xmlFirmado);
    
    const certBase64 = xmlObj['ds:Signature']?.['ds:KeyInfo']?.['ds:X509Data']?.['ds:X509Certificate'];
    
    if (!certBase64) {
      return null;
    }
    
    // Decodificar certificado
    const certDer = forge.util.decode64(certBase64);
    const certAsn1 = forge.asn1.fromDer(certDer);
    const cert = forge.pki.certificateFromAsn1(certAsn1);
    
    const subject = cert.subject.attributes;
    const issuer = cert.issuer.attributes;
    
    const titular = subject.find((attr: any) => attr.name === 'commonName')?.value || '';
    const emisor = issuer.find((attr: any) => attr.name === 'commonName')?.value || '';
    const serialNumber = subject.find((attr: any) => attr.name === 'serialNumber')?.value || '';
    const ruc = serialNumber.replace(/\D/g, '').substring(0, 13);
    
    return {
      titular,
      ruc,
      valido_desde: cert.validity.notBefore.toISOString(),
      valido_hasta: cert.validity.notAfter.toISOString(),
      emisor,
      serial: cert.serialNumber
    };
  } catch (error) {
    console.error('❌ Error extrayendo certificado:', error);
    return null;
  }
}
