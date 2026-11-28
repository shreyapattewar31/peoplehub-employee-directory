import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

const uploadDirectory = fileURLToPath(new URL('../../uploads/employees/', import.meta.url));
const CLOUDINARY_PHOTO_PATTERN = /^peoplehub\/employees\/[a-f0-9-]{36}$/;

export const IMAGE_POLICY = {
  maxBytes: config.image.maxBytes,
  minDimension: config.image.minDimension,
  maxDimension: config.image.maxDimension,
  formats: ['JPEG', 'PNG', 'WebP'],
  guidance: 'JPEG, PNG, or WebP · maximum 2 MB · 128–4096 px on each side.',
};

function isCloudinaryPhoto(filename) {
  return typeof filename === 'string' && CLOUDINARY_PHOTO_PATTERN.test(filename);
}

export function createEmployeePhotoService({
  useCloudStorage = config.nodeEnv === 'production',
  cloudinaryClient = cloudinary,
  settings = config.cloudinary,
} = {}) {
  const cloudinaryConfigured = Boolean(settings.cloudName && settings.apiKey && settings.apiSecret);

  if (useCloudStorage && cloudinaryConfigured) {
    cloudinaryClient.config({
      cloud_name: settings.cloudName,
      api_key: settings.apiKey,
      api_secret: settings.apiSecret,
      secure: true,
    });
  }

  function ensureCloudinaryConfigured() {
    if (!cloudinaryConfigured) {
      const error = new Error('Employee photo storage is not configured.');
      error.code = 'CLOUDINARY_NOT_CONFIGURED';
      throw error;
    }
  }

  async function saveEmployeePhoto(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      const error = new Error('Choose an image to upload.');
      error.code = 'INVALID_IMAGE';
      throw error;
    }

    if (buffer.length > IMAGE_POLICY.maxBytes) {
      const error = new Error('Image must be 2 MB or smaller.');
      error.code = 'IMAGE_TOO_LARGE';
      throw error;
    }

    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      const error = new Error('The selected file is not a valid image.');
      error.code = 'INVALID_IMAGE';
      throw error;
    }

    if (!IMAGE_POLICY.formats.includes(metadata.format?.toUpperCase())
      || !metadata.width
      || !metadata.height
      || metadata.width < IMAGE_POLICY.minDimension
      || metadata.height < IMAGE_POLICY.minDimension
      || metadata.width > IMAGE_POLICY.maxDimension
      || metadata.height > IMAGE_POLICY.maxDimension) {
      const error = new Error('Use a JPEG, PNG, or WebP image between 128 and 4096 pixels on each side.');
      error.code = 'INVALID_IMAGE';
      throw error;
    }

    let output;
    try {
      output = await sharp(buffer)
        .rotate()
        .resize(config.image.outputDimension, config.image.outputDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      const error = new Error('The selected image could not be processed.');
      error.code = 'INVALID_IMAGE';
      throw error;
    }

    if (useCloudStorage) {
      ensureCloudinaryConfigured();
      const publicId = `peoplehub/employees/${randomUUID()}`;
      await cloudinaryClient.uploader.upload(`data:image/webp;base64,${output.toString('base64')}`, {
        public_id: publicId,
        resource_type: 'image',
        type: 'authenticated',
        overwrite: false,
      });
      return publicId;
    }

    const filename = `${randomBytes(16).toString('hex')}.webp`;
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, filename), output, { flag: 'wx' });
    return filename;
  }

  function getEmployeePhotoPath(filename) {
    if (!filename || isCloudinaryPhoto(filename) || path.basename(filename) !== filename || !/^[a-f0-9]{32}\.webp$/.test(filename)) {
      return null;
    }

    return path.join(uploadDirectory, filename);
  }

  function getEmployeePhotoUrl(filename) {
    if (!isCloudinaryPhoto(filename)) {
      return null;
    }

    ensureCloudinaryConfigured();
    return cloudinaryClient.utils.private_download_url(filename, 'webp', {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 300,
      attachment: false,
    });
  }

  async function deleteEmployeePhoto(filename) {
    if (isCloudinaryPhoto(filename)) {
      ensureCloudinaryConfigured();
      await cloudinaryClient.uploader.destroy(filename, {
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true,
      });
      return;
    }

    const photoPath = getEmployeePhotoPath(filename);
    if (!photoPath) {
      return;
    }

    try {
      await unlink(photoPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return {
    saveEmployeePhoto,
    getEmployeePhotoPath,
    getEmployeePhotoUrl,
    deleteEmployeePhoto,
  };
}

const employeePhotoService = createEmployeePhotoService();

export const saveEmployeePhoto = employeePhotoService.saveEmployeePhoto;
export const getEmployeePhotoPath = employeePhotoService.getEmployeePhotoPath;
export const getEmployeePhotoUrl = employeePhotoService.getEmployeePhotoUrl;
export const deleteEmployeePhoto = employeePhotoService.deleteEmployeePhoto;
