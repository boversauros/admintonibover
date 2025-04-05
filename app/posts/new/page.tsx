"use client";

import React, { useState } from "react";
import { DEMO_POSTS, CATEGORIES } from "../../../data";
import { PlusCircle, X, Save, ArrowLeft } from "lucide-react";
import {
  Category,
  EditableArrayFieldProps,
  EditableFieldProps,
  ImageData,
  Post,
  PostReferences,
  PostEditorProps,
} from "../../../types";
import { useRouter } from "next/navigation";

const DEFAULT_POST: Post = DEMO_POSTS[0];

const PostEditor: React.FC<PostEditorProps> = ({ postId }) => {
  const router = useRouter();
  const [post, setPost] = useState<Post>(DEFAULT_POST);
  const [activeEditField, setActiveEditField] = useState<string | null>(null);
  const [contentEditMode, setContentEditMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  React.useEffect(() => {
    if (postId) {
      setLoading(true);
      setTimeout(() => {
        setPost({
          ...DEFAULT_POST,
          title: "La influència del minimalisme en el disseny web modern",
          category: "perspectives",
          date: "12 de març de 2025",
          isPublished: true,
        });
        setLoading(false);
      }, 500);
    }
  }, [postId]);

  const EditableField: React.FC<EditableFieldProps> = ({
    value,
    fieldName,
    isMultiline = false,
    isArray = false,
    index = null,
    arrayPath = null,
    className = "",
  }) => {
    const isEditing =
      activeEditField ===
      (index !== null ? `${fieldName}-${index}` : fieldName);

    const startEditing = (): void => {
      setActiveEditField(index !== null ? `${fieldName}-${index}` : fieldName);
    };

    const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ): void => {
      const newValue = e.target.value;
      if (isArray && index !== null && arrayPath) {
        handleArrayUpdate(arrayPath, index, newValue);
      } else {
        handleFieldChange(fieldName, newValue);
      }
    };

    const handleBlur = (): void => {
      setActiveEditField(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent): void => {
      if (e.key === "Enter" && !isMultiline) {
        setActiveEditField(null);
      }
    };

    return (
      <div
        className={`editable-field-container relative group cursor-pointer ${className}`}
        onClick={!isEditing ? startEditing : undefined}
      >
        {isEditing ? (
          isMultiline ? (
            <textarea
              value={value}
              onChange={handleChange}
              onBlur={handleBlur}
              className="w-full p-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none"
              rows={3}
              autoFocus
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-full p-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none"
              autoFocus
            />
          )
        ) : (
          <>
            <div className="editable-content">
              {value || (
                <span className="text-gray-500 italic">Clica per editar</span>
              )}
            </div>
            <div className="absolute inset-0 border border-transparent border-dashed group-hover:border-gray-600 rounded transition-all opacity-0 group-hover:opacity-100"></div>
          </>
        )}
      </div>
    );
  };

  const handleFieldChange = (field: string, value: string): void => {
    setPost((prev) => {
      const updated = { ...prev };

      if (field.includes(".")) {
        const [parent, child] = field.split(".");
        if (
          parent === "portraitImage" &&
          (child === "url" || child === "title")
        ) {
          updated.portraitImage = {
            ...updated.portraitImage,
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
      } else {
        if (arrayPath === "images") {
          updated.images = [...updated.images, defaultValue as ImageData];
        } else if (arrayPath === "keywords") {
          updated.keywords = [...updated.keywords, defaultValue as string];
        }
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
      } else {
        if (arrayPath === "images") {
          updated.images = updated.images.filter((_, i) => i !== index);
        } else if (arrayPath === "keywords") {
          updated.keywords = updated.keywords.filter((_, i) => i !== index);
        }
      }

      return updated;
    });
  };

  const handleArrayUpdate = (
    arrayPath: string,
    index: number,
    value: string | ImageData
  ): void => {
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
          newArray[index] = value as string;
          updated.references = {
            ...updated.references,
            [child]: newArray,
          };
        }
      } else {
        if (arrayPath === "images") {
          const newImages = [...updated.images];

          if (typeof value === "string" && newImages[index]) {
            newImages[index] = { ...newImages[index], title: value };
          } else if (typeof value === "object") {
            newImages[index] = value as ImageData;
          }
          updated.images = newImages;
        } else if (arrayPath === "keywords") {
          const newKeywords = [...updated.keywords];
          newKeywords[index] = value as string;
          updated.keywords = newKeywords;
        }
      }

      return updated;
    });
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

  const EditableArrayField: React.FC<EditableArrayFieldProps> = ({
    items,
    arrayPath,
    itemLabel,
    defaultValue = "",
    isImageArray = false,
  }) => {
    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2 group relative">
            {isImageArray ? (
              <div className="relative w-full">
                <div className="aspect-video relative overflow-hidden rounded bg-gray-800">
                  <img
                    src={(item as ImageData).url}
                    alt={(item as ImageData).title}
                    className="w-full h-full object-cover transition-opacity duration-700 hover:opacity-95"
                  />
                  <div className="absolute inset-0 group-hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center">
                    <div className="absolute inset-0 border border-dashed border-gray-500 rounded-sm opacity-0 group-hover:opacity-100 pointer-events-none"></div>
                    <button className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded">
                      Canviar imatge
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-400 font-serif italic">
                  <EditableField
                    value={(item as ImageData).title}
                    fieldName="title"
                    index={index}
                    arrayPath={arrayPath}
                    isArray={true}
                  />
                </p>
              </div>
            ) : (
              <EditableField
                value={item as string}
                fieldName={arrayPath}
                index={index}
                arrayPath={arrayPath}
                isArray={true}
                className="flex-grow"
              />
            )}
            <button
              onClick={() => handleArrayRemove(arrayPath, index)}
              className="text-gray-500 hover:text-white transition-colors mt-1"
              title="Eliminar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ))}

        <button
          onClick={() =>
            handleArrayAdd(
              arrayPath,
              isImageArray
                ? {
                    url: "https://picsum.photos/id/3/1200/800",
                    title: "Nova imatge",
                  }
                : defaultValue
            )
          }
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white transition-colors mt-2"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Afegir {itemLabel}</span>
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        Carregant...
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen">
      {/* Top toolbar */}
      <div className="fixed top-0 left-0 right-0 bg-gray-900 border-b border-gray-800 z-10 px-6 py-3">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <button
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Tornar</span>
          </button>

          <div className="flex items-center gap-2">
            <select
              value={post.category}
              onChange={(e) => handleFieldChange("category", e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded px-3 py-1 text-gray-300"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-4 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
              disabled={loading}
            >
              <Save className="w-4 h-4" />
              <span>{loading ? "Guardant..." : "Guardar"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content area - Post preview with editable fields */}
      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          {/* Navigation breadcrumb */}
          <nav className="mb-12">
            <ol className="flex items-center space-x-2 text-sm text-gray-400">
              <li>
                <span className="hover:text-white transition-colors">
                  Reflexions
                </span>
              </li>
              <li>/</li>
              <li>
                <span className="hover:text-white transition-colors">
                  {CATEGORIES.find((c) => c.id === post.category)?.name}
                </span>
              </li>
            </ol>
          </nav>

          <article className="space-y-12">
            {/* Header */}
            <header className="space-y-4">
              <h1 className="text-3xl font-serif text-gray-100">
                <EditableField value={post.title} fieldName="title" />
              </h1>
              <p className="text-sm text-gray-400">
                <EditableField value={post.date} fieldName="date" />
              </p>
            </header>

            {/* Main images */}
            <div className="space-y-8">
              <div
                className={`grid gap-8 ${
                  post.images.length === 1
                    ? "grid-cols-1"
                    : post.images.length === 2
                    ? "grid-cols-1 md:grid-cols-2"
                    : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                }`}
              >
                {post.images.map((image, index) => (
                  <div key={index} className="space-y-2 group relative">
                    <div className="aspect-video relative overflow-hidden rounded bg-gray-800">
                      <img
                        src={image.url}
                        alt={image.title}
                        className="w-full h-full object-cover transition-opacity duration-700 hover:opacity-95"
                      />
                      <div className="absolute inset-0 group-hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center">
                        <div className="absolute inset-0 border border-dashed border-gray-500 rounded-sm opacity-0 group-hover:opacity-100 pointer-events-none"></div>
                        <button className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded">
                          Canviar imatge
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400 font-serif italic">
                      <EditableField
                        value={image.title}
                        fieldName={`images.${index}.title`}
                        isArray={true}
                        arrayPath="images"
                        index={index}
                      />
                    </p>
                    <button
                      onClick={() => handleArrayRemove("images", index)}
                      className="absolute top-2 right-2 bg-gray-800 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Eliminar imatge"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <div className="flex items-center justify-center border-2 border-dashed border-gray-800 rounded hover:border-gray-600 transition-colors cursor-pointer aspect-video">
                  <div className="flex flex-col items-center justify-center">
                    <PlusCircle className="w-8 h-8 text-gray-600" />
                    <span className="mt-2 text-sm text-gray-500">
                      Afegir imatge
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="prose max-w-none">
              <div
                className={`rounded relative ${
                  contentEditMode ? "bg-gray-900 border border-gray-800" : ""
                }`}
              >
                {contentEditMode ? (
                  <div className="space-y-4 p-4">
                    <div
                      className="min-h-32 p-2 focus:outline-none text-gray-300"
                      contentEditable={true}
                      dangerouslySetInnerHTML={{ __html: post.content }}
                      onBlur={(e) => {
                        const target = e.target as HTMLElement;
                        handleContentChange(target.innerHTML);
                        setContentEditMode(false);
                      }}
                    />
                    <div className="flex justify-end">
                      <button
                        className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                        onClick={() => setContentEditMode(false)}
                      >
                        Acabar edició
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => !contentEditMode && setContentEditMode(true)}
                    className="cursor-pointer relative group"
                  >
                    <div
                      dangerouslySetInnerHTML={{ __html: post.content }}
                      className="text-gray-300"
                    />
                    <div className="absolute inset-0 border border-transparent border-dashed group-hover:border-gray-700 rounded opacity-0 group-hover:opacity-100 pointer-events-none"></div>
                  </div>
                )}
              </div>
            </div>

            {/* References */}
            <div className="border-t border-gray-800 pt-8">
              <h2 className="text-xl font-serif mb-6">Referències</h2>

              <h3 className="text-lg font-serif mb-3 text-gray-200">Imatges</h3>
              <ul className="space-y-4 text-gray-400">
                {post.references.images.map((ref, index) => (
                  <li key={index} className="flex items-start gap-2 group">
                    <span className="text-gray-300">Imatge:</span>
                    <div className="flex-grow">
                      <EditableField
                        value={ref}
                        fieldName={`references.images.${index}`}
                        isArray={true}
                        arrayPath="references.images"
                        index={index}
                      />
                    </div>
                    <button
                      onClick={() =>
                        handleArrayRemove("references.images", index)
                      }
                      className="text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    onClick={() =>
                      handleArrayAdd(
                        "references.images",
                        "Nova referència d'imatge"
                      )
                    }
                    className="inline-flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Afegir referència d'imatge</span>
                  </button>
                </li>
              </ul>

              <h3 className="text-lg font-serif mb-3 mt-6 text-gray-200">
                Textos
              </h3>
              <ul className="space-y-4 text-gray-400">
                {post.references.texts.map((ref, index) => (
                  <li key={index} className="flex items-start gap-2 group">
                    <span className="text-gray-300">Text:</span>
                    <div className="flex-grow">
                      <EditableField
                        value={ref}
                        fieldName={`references.texts.${index}`}
                        isArray={true}
                        arrayPath="references.texts"
                        index={index}
                      />
                    </div>
                    <button
                      onClick={() =>
                        handleArrayRemove("references.texts", index)
                      }
                      className="text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    onClick={() =>
                      handleArrayAdd(
                        "references.texts",
                        "Nova referència de text"
                      )
                    }
                    className="inline-flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Afegir referència de text</span>
                  </button>
                </li>
              </ul>
            </div>

            {/* Keywords */}
            <div className="border-t border-gray-800 pt-8">
              <h2 className="text-xl font-serif mb-6">Paraules clau</h2>
              <div className="flex flex-wrap gap-2">
                {post.keywords.map((keyword, index) => (
                  <div key={index} className="relative group">
                    <div className="bg-gray-800 py-1 px-3 rounded-full text-sm text-gray-300 group-hover:bg-gray-700 transition-colors">
                      <EditableField
                        value={keyword}
                        fieldName={`keywords.${index}`}
                        isArray={true}
                        arrayPath="keywords"
                        index={index}
                      />
                    </div>
                    <button
                      onClick={() => handleArrayRemove("keywords", index)}
                      className="absolute -top-1 -right-1 bg-gray-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ transform: "scale(0.7)" }}
                      title="Eliminar paraula clau"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => handleArrayAdd("keywords", "Nova paraula")}
                  className="bg-gray-800 hover:bg-gray-700 py-1 px-3 rounded-full text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  <PlusCircle className="w-3 h-3" />
                  <span>Afegir</span>
                </button>
              </div>
            </div>
          </article>
        </div>
      </main>

      <style jsx global>{`
        .prose {
          color: #e2e8f0;
        }

        .prose p {
          margin-bottom: 1.25em;
          color: #d1d5db;
          line-height: 1.7;
        }

        .prose h1,
        .prose h2,
        .prose h3,
        .prose h4 {
          color: #f3f4f6;
          font-weight: 400;
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times,
            serif;
          margin-top: 2em;
          margin-bottom: 1em;
        }

        .prose a {
          color: #e2e8f0;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default PostEditor;
