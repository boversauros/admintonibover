import { useState, useEffect, useCallback } from "react";
import { Post, ImageData, PostReferences } from "../../../types";
import { DEMO_POSTS } from "../../../data";
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_POST: Post = DEMO_POSTS[0];

export const usePostEditor = (postId?: string) => {
  const [post, setPost] = useState<Post>({
    ...DEFAULT_POST,
    language: 'ca' // Default to Catalan
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
      const updated = { ...prev };

      if (field.includes(".")) {
        const [parent, child] = field.split(".");
        if (
          parent === "thumbnail" &&
          (child === "url" || child === "title")
        ) {
          updated.thumbnail = {
            ...updated.thumbnail,
            [child]: value,
          };
        }
      } else {
        (updated as any)[field] = value;
      }

      return updated;
    });
  };

  const handleArrayAdd = (
    arrayPath: string,
    defaultValue: string | ImageData
  ): void => {
    setPost((prev) => {
      const updated = { ...prev };

      if (arrayPath.includes(".")) {
        const [parent, child] = arrayPath.split(".");
        if (
          parent === "references" &&
          (child === "images" || child === "texts")
        ) {
          updated.references = {
            ...updated.references,
            [child]: [
              ...(updated.references[
                child as keyof PostReferences
              ] as string[]),
              defaultValue as string,
            ],
          };
        }
      } else if (arrayPath === "keywords") {
        updated.keywords = [...updated.keywords, defaultValue as string];
      }

      return updated;
    });
  };

  const handleArrayRemove = (arrayPath: string, index: number): void => {
    setPost((prev) => {
      const updated = { ...prev };

      if (arrayPath.includes(".")) {
        const [parent, child] = arrayPath.split(".");
        if (
          parent === "references" &&
          (child === "images" || child === "texts")
        ) {
          const newArray = [
            ...(updated.references[child as keyof PostReferences] as string[]),
          ];
          newArray.splice(index, 1);
          updated.references = {
            ...updated.references,
            [child]: newArray,
          };
        }
      } else if (arrayPath === "keywords") {
        updated.keywords = updated.keywords.filter((_, i) => i !== index);
      }

      return updated;
    });
  };

  const handleImageUpdate = (image: ImageData | null): void => {
    setPost((prev) => ({
      ...prev,
      image,
    }));
  };

  const handleContentChange = (html: string): void => {
    setPost((prev) => ({ ...prev, content: html }));
  };

  const preparePostForSubmission = useCallback((postData: Post) => {
    const now = new Date();
    
    return {
      id: postData.id || uuidv4(),
      title: postData.title.trim(),
      category: postData.category,
      content: postData.content,
      language: postData.language,
      image: postData.image,
      thumbnail: postData.thumbnail,
      keywords: postData.keywords.filter(k => k.trim() !== ''),
      references: {
        images: postData.references.images.filter(Boolean),
        texts: postData.references.texts.filter(Boolean)
      },
      isPublished: postData.isPublished || false,
      createdAt: postData.createdAt || now,
      updatedAt: now,
      // Optional fields with defaults
      author: postData.author || '',
      slug: postData.slug || postData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      tags: postData.tags || []
    } as Post;
  }, []);

  const handleSave = async (): Promise<void> => {
    try {
      setLoading(true);
      const postToSave = preparePostForSubmission(post);
      console.log('Prepared post for submission:', postToSave);
      
      // Here you would typically make an API call to save to Supabase
      // For now, we'll just log it
      // const { data, error } = await supabase
      //   .from('posts')
      //   .upsert(postToSave);
      
      // if (error) throw error;
      
      // Update local state with the saved post
      setPost(prev => ({
        ...prev,
        ...postToSave
      }));
      
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
