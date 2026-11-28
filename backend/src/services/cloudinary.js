import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

const DOCUMENT_TYPES = new Set(['aadhaar', 'pan', 'bank_book']);
const IMAGE_FORMATS = new Set(['jpg', 'png', 'webp']);
const ALLOWED_FORMATS = new Set(['pdf', 'doc', 'docx', 'jpg', 'png', 'webp']);

function serviceError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeFormat(filename) {
  const extension = String(filename || '').split('.').pop()?.toLowerCase();
  if (extension === 'jpeg') {
    return 'jpg';
  }
  return extension || '';
}

export function createCloudinaryDocumentService({
  client = cloudinary,
  settings = config.cloudinary,
  maxBytes = config.documents.maxBytes,
} = {}) {
  const configured = Boolean(settings.cloudName && settings.apiKey && settings.apiSecret);

  if (configured) {
    client.config({
      cloud_name: settings.cloudName,
      api_key: settings.apiKey,
      api_secret: settings.apiSecret,
      secure: true,
    });
  }

  function ensureConfigured() {
    if (!configured) {
      throw serviceError('Document uploads are not configured.', 'CLOUDINARY_NOT_CONFIGURED');
    }
  }

  function createUpload({ applicationId, documentType, filename }) {
    ensureConfigured();

    if (!DOCUMENT_TYPES.has(documentType)) {
      throw serviceError('Unsupported document type.', 'INVALID_DOCUMENT');
    }

    const format = normalizeFormat(filename);
    if (!ALLOWED_FORMATS.has(format)) {
      throw serviceError('Use a PDF, DOC, DOCX, JPG, PNG, or WebP file.', 'INVALID_DOCUMENT');
    }

    const resourceType = IMAGE_FORMATS.has(format) ? 'image' : 'raw';
    const publicId = `peoplehub/private/${applicationId}/${documentType}/${randomUUID()}.${format}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const uploadParameters = {
      timestamp,
      public_id: publicId,
      type: 'authenticated',
      ...(settings.uploadPreset ? { upload_preset: settings.uploadPreset } : {}),
    };
    const signature = client.utils.api_sign_request(uploadParameters, settings.apiSecret);

    return {
      cloudName: settings.cloudName,
      apiKey: settings.apiKey,
      timestamp,
      signature,
      publicId,
      resourceType,
      format,
      uploadPreset: settings.uploadPreset || null,
    };
  }

  async function verifyUpload({ publicId, resourceType, format }) {
    ensureConfigured();

    if (typeof publicId !== 'string' || !publicId || publicId.length > 255 || !['image', 'raw'].includes(resourceType)) {
      throw serviceError('Invalid document upload metadata.', 'INVALID_DOCUMENT');
    }

    const expectedFormat = normalizeFormat(`document.${format}`);
    if (!ALLOWED_FORMATS.has(expectedFormat)) {
      throw serviceError('Unsupported document format.', 'INVALID_DOCUMENT');
    }

    const resource = await client.api.resource(publicId, {
      resource_type: resourceType,
      type: 'authenticated',
    });

    const actualFormat = normalizeFormat(`document.${resource.format || ''}`);
    const matches = resource.public_id === publicId
      && resource.resource_type === resourceType
      && resource.type === 'authenticated'
      && actualFormat === expectedFormat
      && Number.isFinite(Number(resource.bytes))
      && Number(resource.bytes) > 0
      && Number(resource.bytes) <= maxBytes;

    if (!matches) {
      throw serviceError('The uploaded document could not be verified.', 'DOCUMENT_VERIFICATION_FAILED');
    }

    return {
      publicId,
      resourceType,
      format: actualFormat,
      bytes: Number(resource.bytes),
      versionId: resource.version_id ? String(resource.version_id) : null,
    };
  }

  function downloadUrl({ publicId, resourceType, format }) {
    ensureConfigured();
    return client.utils.private_download_url(publicId, format, {
      resource_type: resourceType,
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 300,
      attachment: true,
    });
  }

  async function destroy({ publicId, resourceType }) {
    ensureConfigured();
    return client.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: 'authenticated',
      invalidate: true,
    });
  }

  return {
    isConfigured: () => configured,
    createUpload,
    verifyUpload,
    downloadUrl,
    destroy,
  };
}

export const cloudinaryDocuments = createCloudinaryDocumentService();
