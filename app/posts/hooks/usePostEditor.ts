import { useState, useEffect, useCallback } from "react";
import { Post, ImageData, PostReferences } from "../../../types";
import { DEMO_POSTS } from "../../../data";
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_POST: Post = DEMO_POSTS[0];

export const usePostEditor = (postId?: string) => {
  const [post, setPost] = useState<Post>(() => {
    const defaultPost = {
      ...DEFAULT_POST,
      id: uuidv4(), // Generate a new UUID for new posts
      language: 'ca', // Default to Catalan
      createdAt: new Date(),
      updatedAt: new Date(),
      // Ensure required fields are set
      image_id: DEFAULT_POST.image?.id || null,
      thumbnail_id: DEFAULT_POST.thumbnail?.id || uuidv4(),
      // Make sure image and thumbnail are properly typed
      image: DEFAULT_POST.image ? { ...DEFAULT_POST.image } : null,
      thumbnail: DEFAULT_POST.thumbnail ? { ...DEFAULT_POST.thumbnail } : undefined
    };
    return defaultPost as Post;
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [activeEditField, setActiveEditField] = useState<string | null>(null);

  console.log(post);

  useEffect(() => {
    if (postId) {
      setLoading(true);
      setTimeout(() => {
        setPost({
          ...DEFAULT_POST,
          title: "La influència del minimalisme en el disseny web modern",
          category: "perspectives",
          isPublished: false,
          language: 'ca',
        });
        setLoading(false);
      }, 500);
    }
  }, [postId]);

  const handleFieldChange = (field: string, value: string): void => {
    setPost((prev) => {
      // Handle nested fields (e.g., thumbnail.url, thumbnail.title)
      if (field.includes(".")) {
        const [parent, child] = field.split(".");
        if (parent === "thumbnail" && (child === "url" || child === "title")) {
          return {
            ...prev,
            thumbnail: prev.thumbnail ? {
              ...prev.thumbnail,
              [child]: value
            } : {
              id: uuidv4(),
              url: child === 'url' ? value : '',
              title: child === 'title' ? value : '',
              alt: ''
            }
          };
        }
        return prev;
      }

      // Handle top-level fields
      switch (field) {
        case 'title':
        case 'content':
        case 'author':
        case 'slug':
          return { ...prev, [field]: value };
        case 'language':
          return { ...prev, language: value as 'ca' | 'en' };
        case 'category':
          return { ...prev, category: value };
        case 'isPublished':
          return { ...prev, isPublished: value === 'true' };
        default:
          return prev;
      }
    });
  };

  const handleArrayAdd = (
    arrayPath: string,
    defaultValue: string | ImageData
  ): void => {
    setPost((prev) => {
      // Handle nested arrays (e.g., references.images, references.texts)
      if (arrayPath.includes(".")) {
        const [parent, child] = arrayPath.split(".");
        if (parent === "references") {
          if (child === "images") {
            const imageData = defaultValue as ImageData;
            const newImage: ImageData = {
              id: imageData.id || uuidv4(),
              url: imageData.url || '',
              title: imageData.title || 'Untitled',
              alt: imageData.alt || '',
              ...(imageData.file && { file: imageData.file })
            };
            
            return {
              ...prev,
              references: {
                ...prev.references,
                images: [...prev.references.images, newImage.url]
              }
            };
          } else if (child === "texts") {
            return {
              ...prev,
              references: {
                ...prev.references,
                texts: [...prev.references.texts, defaultValue as string]
              }
            };
          }
        }
      } 
      // Handle top-level arrays (e.g., keywords)
      else if (arrayPath === "keywords") {
        return {
          ...prev,
          keywords: [...prev.keywords, defaultValue as string]
        };
      }

      return prev;
    });
  };

  const handleArrayRemove = (arrayPath: string, index: number): void => {
    setPost((prev) => {
      // Handle nested arrays (e.g., references.images, references.texts)
      if (arrayPath.includes(".")) {
        const [parent, child] = arrayPath.split(".");
        if (parent === "references") {
          if (child === "images") {
            return {
              ...prev,
              references: {
                ...prev.references,
                images: prev.references.images.filter((_, i) => i !== index)
              }
            };
          } else if (child === "texts") {
            return {
              ...prev,
              references: {
                ...prev.references,
                texts: prev.references.texts.filter((_, i) => i !== index)
              }
            };
          }
        }
      } 
      // Handle top-level arrays (e.g., keywords)
      else if (arrayPath === "keywords") {
        return {
          ...prev,
          keywords: prev.keywords.filter((_, i) => i !== index)
        };
      }

      return prev;
    });
  };

  const handleArrayUpdate = (
    arrayPath: string,
    index: number,
    value: string | ImageData
  ): void => {
    setPost((prev) => {
      // Handle nested arrays (e.g., references.images, references.texts)
      if (arrayPath.includes(".")) {
        const [parent, child] = arrayPath.split(".");
        if (parent === "references") {
          if (child === "images") {
            const imageData = value as ImageData;
            const updatedImages = [...prev.references.images];
            updatedImages[index] = imageData.url;
            
            return {
              ...prev,
              references: {
                ...prev.references,
                images: updatedImages
              }
            };
          } else if (child === "texts") {
            return {
              ...prev,
              references: {
                ...prev.references,
                texts: prev.references.texts.map((item, i) => 
                  i === index ? (value as string) : item
                )
              }
            };
          }
        }
      } 
      // Handle top-level arrays (e.g., keywords)
      else if (arrayPath === "keywords") {
        return {
          ...prev,
          keywords: prev.keywords.map((item, i) => 
            i === index ? (value as string) : item
          )
        };
      }

      return prev;
    });
  };

  const handleImageUpdate = (newImage: ImageData | null): void => {
    setPost((prev) => {
      if (!newImage) {
        return {
          ...prev,
          image: null,
          image_id: null
        } as Post;
      }

      // Ensure the image has all required fields
      const imageId = newImage.id || uuidv4();
      const updatedImage: ImageData = {
        id: imageId,
        url: newImage.url || '',
        title: newImage.title || '',
        alt: newImage.alt || '',
        ...(newImage.file && { file: newImage.file })
      };
      
      // If this is the first image being set, also set it as thumbnail
      const shouldSetThumbnail = !prev.thumbnail_id;
      
      // Create the updated post object
      const updatedPost: Post = {
        ...prev,
        image: updatedImage,
        image_id: imageId,
        ...(shouldSetThumbnail && {
          thumbnail: { ...updatedImage },
          thumbnail_id: imageId
        })
      };
      
      return updatedPost;
    });
  };

  const handleContentChange = (html: string): void => {
    setPost((prev) => ({ ...prev, content: html }));
  };

  const preparePostForSubmission = useCallback((postData: Post) => {
    const now = new Date();
    const isNewPost = !postData.id || !postData.createdAt;
    
    // Get image and thumbnail IDs, ensuring we always have values
    const imageId = postData.image?.id || postData.image_id || null;
    const thumbnailId = postData.thumbnail?.id || postData.thumbnail_id || 
                      (postData.image?.id ? postData.image.id : uuidv4());
    
    // Create a new object with only the fields we want to send to the server
    const postToSubmit = {
      id: postData.id || uuidv4(),
      title: postData.title.trim(),
      category: postData.category,
      content: postData.content,
      language: postData.language,
      image_id: imageId,
      thumbnail_id: thumbnailId,
      keywords: postData.keywords.filter(k => k.trim() !== ''),
      references: {
        images: postData.references.images.filter(Boolean),
        texts: postData.references.texts.filter(Boolean)
      },
      isPublished: postData.isPublished || false,
      createdAt: isNewPost ? now : new Date(postData.createdAt),
      updatedAt: now,
      author: postData.author || '',
      slug: postData.slug || postData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      tags: postData.tags || []
    };
    
    return postToSubmit;
  }, []);

  const handleSave = async (): Promise<void> => {
    try {
      setLoading(true);
      // Get the prepared post data with proper types
      const postToSave = preparePostForSubmission(post);
      
      // Create a new object with only the fields we want to send to the server
      const postForServer = {
        ...postToSave,
        // Ensure we're not sending the full image objects to the server
        image: undefined,
        thumbnail: undefined
      };
      
      console.log('Saving post to server:', postForServer);
      
      // Here you would typically make an API call to save to Supabase
      // For now, we'll just log it
      // const { data, error } = await supabase
      //   .from('posts')
      //   .upsert(postForServer);
      
      // if (error) throw error;
      
      // Update local state with the saved post
      // Keep the image objects in local state but update the IDs
      setPost(prev => {
        // Create updated image objects with the new IDs if they exist
        const updatedImage = prev.image ? { 
          ...prev.image, 
          id: postToSave.image_id || prev.image.id 
        } : null;
        
        const updatedThumbnail = prev.thumbnail ? { 
          ...prev.thumbnail, 
          id: postToSave.thumbnail_id 
        } : null;
        
        // Return the updated post with proper typing
        const updatedPost: Post = {
          ...prev,
          ...postToSave,
          image: updatedImage,
          thumbnail: updatedThumbnail,
          image_id: postToSave.image_id,
          thumbnail_id: postToSave.thumbnail_id,
          // Ensure these are properly typed
          id: postToSave.id,
          title: postToSave.title,
          category: postToSave.category,
          content: postToSave.content,
          language: postToSave.language,
          keywords: postToSave.keywords,
          references: postToSave.references,
          isPublished: postToSave.isPublished,
          createdAt: postToSave.createdAt,
          updatedAt: postToSave.updatedAt,
          author: postToSave.author,
          slug: postToSave.slug,
          tags: postToSave.tags || []
        };
        
        return updatedPost;
      });
      
      // Show success message or redirect
      alert('Post saved successfully!');
    } catch (error) {
      console.error('Error saving post:', error);
      alert('Failed to save post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return {
    post,
    loading,
    activeEditField,
    setActiveEditField,
    handleFieldChange,
    handleArrayAdd,
    handleArrayRemove,
    handleImageUpdate,
    handleContentChange,
    handleSave,
  };
};
