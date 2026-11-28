import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  createEmployeePhotoService,
  deleteEmployeePhoto,
  getEmployeePhotoPath,
  IMAGE_POLICY,
  saveEmployeePhoto,
} from '../src/services/employeePhotos.js';

test('valid employee photos are re-encoded and safely stored', async () => {
  const input = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#3525cd' } })
    .png()
    .toBuffer();
  const filename = await saveEmployeePhoto(input);

  try {
    assert.match(filename, /^[a-f0-9]{32}\.webp$/);
    const photoPath = getEmployeePhotoPath(filename);
    assert.ok(photoPath.endsWith(filename));
    const metadata = await sharp(await readFile(photoPath)).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 800);
    assert.equal(metadata.height, 533);
  } finally {
    await deleteEmployeePhoto(filename);
  }
});

test('invalid bytes, small dimensions, and oversized files are rejected', async () => {
  await assert.rejects(saveEmployeePhoto(Buffer.from('not an image')), { code: 'INVALID_IMAGE' });

  const small = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  await assert.rejects(saveEmployeePhoto(small), { code: 'INVALID_IMAGE' });
  await assert.rejects(saveEmployeePhoto(Buffer.alloc(IMAGE_POLICY.maxBytes + 1)), { code: 'IMAGE_TOO_LARGE' });
});

test('photo paths cannot escape the employee upload directory', () => {
  assert.equal(getEmployeePhotoPath('../secret.webp'), null);
  assert.equal(getEmployeePhotoPath('/etc/passwd'), null);
  assert.equal(getEmployeePhotoPath('invalid.webp'), null);
});

test('production employee photos use private Cloudinary assets', async () => {
  const uploadCalls = [];
  const destroyCalls = [];
  const downloadCalls = [];
  const client = {
    config() {},
    uploader: {
      async upload(dataUri, options) {
        uploadCalls.push({ dataUri, options });
        return { public_id: options.public_id };
      },
      async destroy(publicId, options) {
        destroyCalls.push({ publicId, options });
      },
    },
    utils: {
      private_download_url(publicId, format, options) {
        downloadCalls.push({ publicId, format, options });
        return `https://download.example/${publicId}`;
      },
    },
  };
  const service = createEmployeePhotoService({
    useCloudStorage: true,
    cloudinaryClient: client,
    settings: { cloudName: 'test-cloud', apiKey: 'key', apiSecret: 'secret' },
  });
  const input = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#3525cd' } })
    .png()
    .toBuffer();

  const publicId = await service.saveEmployeePhoto(input);
  assert.match(publicId, /^peoplehub\/employees\/[a-f0-9-]{36}$/);
  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0].options.type, 'authenticated');
  assert.equal(uploadCalls[0].options.overwrite, false);
  assert.match(uploadCalls[0].dataUri, /^data:image\/webp;base64,/);
  const uploadedBuffer = Buffer.from(uploadCalls[0].dataUri.split(',')[1], 'base64');
  assert.equal((await sharp(uploadedBuffer).metadata()).format, 'webp');
  assert.equal(service.getEmployeePhotoPath(publicId), null);
  assert.equal(
    service.getEmployeePhotoUrl(publicId),
    `https://download.example/${publicId}`,
  );
  assert.equal(downloadCalls[0].format, 'webp');
  assert.equal(downloadCalls[0].options.attachment, false);

  await service.deleteEmployeePhoto(publicId);
  assert.deepEqual(destroyCalls, [{
    publicId,
    options: { resource_type: 'image', type: 'authenticated', invalidate: true },
  }]);
});
