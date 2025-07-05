import { useState, useEffect } from "react";
import { Post, ImageData, PostReferences } from "../../../types";
import { DEMO_POSTS } from "../../../data";

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
          date: "12 de març de 2025",
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

  const handleSave = async (): Promise<void> => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      alert(postId ? "Publicació actualitzada!" : "Publicació creada!");
    } catch (error) {
      console.error("Error saving post:", error);
      alert("Error en guardar la publicació");
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
