import { supabase } from '../supabase';

export type StorageBucket = 'post-thumbnails' | 'post-images';

export interface Image {
  id: string;
  url: string;
  title: string;
  alt: string;
  created_at: string;
  updated_at: string;
}

/**
 * Generate a unique filename for storage
 */
function generateFileName(file: File): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  return `${timestamp}-${randomString}.${extension}`;
}

/**
 * Extract file path from Supabase Storage URL
 */
function extractPathFromUrl(url: string, bucket: StorageBucket): string {
  // URL format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
  const urlParts = url.split(`/object/public/${bucket}/`);
  if (urlParts.length < 2) {
    throw new Error('Invalid storage URL format');
  }
  return urlParts[1];
}

/**
 * Uploads an image file to Supabase Storage
 * @param file - The image file to upload
 * @param bucket - The storage bucket name
 * @param fileName - Optional custom file name
 * @returns The public URL of the uploaded image
 */
export async function uploadImageToStorage(
  file: File,
  bucket: StorageBucket,
  fileName?: string
): Promise<string> {
  try {
    const uploadFileName = fileName || generateFileName(file);

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(uploadFileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(data.path);

    return publicUrl;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to upload image to storage');
  }
}

/**
 * Creates a record in the images table
 * @param url - The storage URL of the image
 * @param title - Image title
 * @param alt - Alt text for accessibility
 * @returns The created image record with ID
 */
export async function createImageRecord(
  url: string,
  title: string = '',
  alt: string = ''
): Promise<Image> {
  try {
    const { data, error } = await supabase
      .from('images')
      .insert({
        url,
        title,
        alt,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create image record: ${error.message}`);
    }

    return {
      id: data.id.toString(),
      url: data.url,
      title: data.title || '',
      alt: data.alt || '',
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to create image record');
  }
}

/**
 * Deletes an image from storage
 * @param url - The full URL of the image to delete
 * @param bucket - The storage bucket name
 */
export async function deleteImageFromStorage(
  url: string,
  bucket: StorageBucket
): Promise<void> {
  try {
    const filePath = extractPathFromUrl(url, bucket);

    const { error } = await supabase.storage.from(bucket).remove([filePath]);

    if (error) {
      throw new Error(`Failed to delete image from storage: ${error.message}`);
    }
  } catch (error: any) {
    // Log error but don't throw - storage deletion failure shouldn't block operations
    console.error('Error deleting image from storage:', error.message);
  }
}

/**
 * Deletes an image record from the database
 * @param imageId - The ID of the image record
 */
export async function deleteImageRecord(imageId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('images')
      .delete()
      .eq('id', parseInt(imageId));

    if (error) {
      throw new Error(`Failed to delete image record: ${error.message}`);
    }
  } catch (error: any) {
    console.error('Error deleting image record:', error.message);
  }
}

/**
 * Gets an image record by ID
 * @param imageId - The image ID
 * @returns The image record or null if not found
 */
export async function getImageById(imageId: string): Promise<Image | null> {
  try {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('id', parseInt(imageId))
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw new Error(`Failed to get image: ${error.message}`);
    }

    return {
      id: data.id.toString(),
      url: data.url,
      title: data.title || '',
      alt: data.alt || '',
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error: any) {
    console.error('Error getting image by ID:', error.message);
    return null;
  }
}

/**
 * Updates an existing image record
 * @param imageId - The image record ID
 * @param alt - Alt text for accessibility
 * @param title - Optional image title
 * @returns The updated image record
 */
export async function updateImageRecord(
  imageId: string,
  alt: string,
  title?: string
): Promise<Image> {
  try {
    const updateData: { alt: string; title?: string; updated_at: string } = {
      alt,
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) {
      updateData.title = title;
    }

    const { data, error } = await supabase
      .from('images')
      .update(updateData)
      .eq('id', parseInt(imageId))
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update image record: ${error.message}`);
    }

    return {
      id: data.id.toString(),
      url: data.url,
      title: data.title || '',
      alt: data.alt || '',
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to update image record');
  }
}

/**
 * Complete flow: Upload file, create record, return image data
 * @param file - The file to upload
 * @param bucket - Storage bucket
 * @param title - Image title
 * @param alt - Alt text
 * @returns The complete image record
 */
export async function uploadAndCreateImage(
  file: File,
  bucket: StorageBucket,
  title: string = '',
  alt: string = ''
): Promise<Image> {
  try {
    // Upload to storage
    const url = await uploadImageToStorage(file, bucket);

    // Create database record
    const imageRecord = await createImageRecord(url, title, alt);

    return imageRecord;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to upload and create image');
  }
}

/**
 * Complete cleanup: Delete from storage and database
 * @param imageId - The image record ID
 * @param imageUrl - The storage URL
 * @param bucket - Storage bucket
 */
export async function deleteImageCompletely(
  imageId: string,
  imageUrl: string,
  bucket: StorageBucket
): Promise<void> {
  try {
    // Delete from storage first
    await deleteImageFromStorage(imageUrl, bucket);

    // Then delete database record
    await deleteImageRecord(imageId);
  } catch (error: any) {
    // Log but don't throw - cleanup errors shouldn't block main operations
    console.error('Error in complete image deletion:', error.message);
  }
}
