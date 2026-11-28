import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudinaryDocumentService } from '../src/services/cloudinary.js';

const settings = {
  cloudName: 'demo-cloud',
  apiKey: 'public-key',
  apiSecret: 'private-key',
};

function createClient(resourceOverrides = {}) {
  const signCalls = [];
  return {
    configCalls: [],
    signCalls,
    config(value) {
      this.configCalls.push(value);
    },
    utils: {
      api_sign_request(params, apiSecret) {
        signCalls.push({ params, apiSecret });
        return `signed:${params.public_id}:${params.timestamp}`;
      },
      private_download_url(publicId, format, options) {
        return `https://download.example/${publicId}?format=${format}&type=${options.type}`;
      },
    },
    api: {
      async resource() {
        return {
          public_id: 'peoplehub/private/application/aadhaar/file.pdf',
          resource_type: 'raw',
          type: 'authenticated',
          format: 'pdf',
          bytes: 1024,
          version_id: '123',
          ...resourceOverrides,
        };
      },
    },
    url(publicId, options) {
      return `https://download.example/${publicId}?type=${options.type}`;
    },
    uploader: {
      async destroy() {
        return { result: 'ok' };
      },
    },
  };
}

test('Cloudinary document uploads use private opaque public IDs and signed parameters', () => {
  const client = createClient();
  const service = createCloudinaryDocumentService({ client, settings });

  const upload = service.createUpload({
    applicationId: 'application',
    documentType: 'aadhaar',
    filename: 'identity.pdf',
  });

  assert.equal(upload.cloudName, 'demo-cloud');
  assert.equal(upload.apiKey, 'public-key');
  assert.equal(upload.resourceType, 'raw');
  assert.equal(upload.format, 'pdf');
  assert.match(upload.publicId, /^peoplehub\/private\/application\/aadhaar\/[a-f0-9-]+\.pdf$/);
  assert.match(upload.signature, /^signed:/);
  assert.equal(client.configCalls[0].secure, true);
});

test('Cloudinary upload presets are included in signed upload parameters', () => {
  const client = createClient();
  const service = createCloudinaryDocumentService({
    client,
    settings: { ...settings, uploadPreset: 'private_documents' },
  });

  const upload = service.createUpload({
    applicationId: 'application',
    documentType: 'aadhaar',
    filename: 'identity.pdf',
  });

  assert.equal(upload.uploadPreset, 'private_documents');
  assert.equal(client.signCalls[0].params.upload_preset, 'private_documents');
  assert.equal(client.signCalls[0].apiSecret, settings.apiSecret);
});

test('Cloudinary document uploads reject unsupported file types', () => {
  const service = createCloudinaryDocumentService({ client: createClient(), settings });

  assert.throws(() => service.createUpload({
    applicationId: 'application',
    documentType: 'pan',
    filename: 'script.exe',
  }), { code: 'INVALID_DOCUMENT' });
});

test('Cloudinary document verification accepts matching authenticated assets', async () => {
  const service = createCloudinaryDocumentService({ client: createClient(), settings });
  const publicId = 'peoplehub/private/application/aadhaar/file.pdf';

  const asset = await service.verifyUpload({ publicId, resourceType: 'raw', format: 'pdf' });

  assert.deepEqual(asset, {
    publicId,
    resourceType: 'raw',
    format: 'pdf',
    bytes: 1024,
    versionId: '123',
  });
});

test('Cloudinary document verification rejects public, oversized, or mismatched assets', async () => {
  const publicId = 'peoplehub/private/application/aadhaar/file.pdf';
  const cases = [
    { type: 'upload' },
    { bytes: 6 * 1024 * 1024 },
    { format: 'png' },
    { resource_type: 'image' },
  ];

  for (const overrides of cases) {
    const service = createCloudinaryDocumentService({ client: createClient(overrides), settings });
    await assert.rejects(
      service.verifyUpload({ publicId, resourceType: 'raw', format: 'pdf' }),
      { code: 'DOCUMENT_VERIFICATION_FAILED' },
    );
  }
});

test('Cloudinary document downloads are authenticated expiring URLs', () => {
  const service = createCloudinaryDocumentService({ client: createClient(), settings });
  const url = service.downloadUrl({
    publicId: 'peoplehub/private/application/aadhaar/file.pdf',
    resourceType: 'raw',
    format: 'pdf',
  });

  assert.match(url, /^https:\/\/download\.example\//);
  assert.match(url, /format=pdf&type=authenticated$/);
});

test('Cloudinary service fails closed when credentials are missing', () => {
  const service = createCloudinaryDocumentService({
    client: createClient(),
    settings: { cloudName: '', apiKey: '', apiSecret: '' },
  });

  assert.equal(service.isConfigured(), false);
  assert.throws(() => service.createUpload({
    applicationId: 'application',
    documentType: 'bank_book',
    filename: 'bank.pdf',
  }), { code: 'CLOUDINARY_NOT_CONFIGURED' });
});
