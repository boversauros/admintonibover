"use client";
import React, { useState } from "react";
import Link from "next/link";
import { PostV2, PostTranslationV2, CategoryV2 } from "@/app/_lib/types-v2";
import { Language } from "@/app/_lib/types";
import { ArrowLeft, Edit, Calendar, Tag, Globe } from "lucide-react";

interface PostViewProps {
  post: PostV2;
  translations: PostTranslationV2[];
  category?: CategoryV2;
}

export const PostView: React.FC<PostViewProps> = ({
  post,
  translations,
  category,
}) => {
  const [activeLanguage, setActiveLanguage] = useState<Language>("ca");

  // Get available languages from translations
  const availableLanguages = translations.map((t) => t.language);

  // Get current translation based on active language
  const currentTranslation = translations.find(
    (t) => t.language === activeLanguage
  );

  // Fallback to first available translation if current language not found
  const displayTranslation = currentTranslation || translations[0];

  if (!displayTranslation) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">No translations available</p>
          <Link href="/" className="text-gray-300 hover:text-white underline">
            Tornar a l'inici
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 bg-black/95 border-b border-gray-800/50 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center h-20 px-6">
          <Link
            href="/"
            className="flex items-center gap-1 text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Tornar</span>
          </Link>

          <div className="flex items-center gap-4">
            {/* Language Switcher */}
            {availableLanguages.length > 1 && (
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-400" />
                <div className="flex gap-1">
                  {availableLanguages.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setActiveLanguage(lang)}
                      className={`px-3 py-1 rounded text-sm transition-all ${
                        lang === activeLanguage
                          ? "bg-white text-black"
                          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {lang === "ca" ? "Català" : "English"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Link
              href={`/posts/${post.id}/edit`}
              className="flex items-center gap-1 text-gray-300 hover:text-white transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span>Editar</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <article className="space-y-8">
            {/* Breadcrumb */}
            <nav className="text-sm text-gray-400">
              <Link href="/" className="hover:text-white transition-colors">
                Inici
              </Link>
              <span className="mx-2">/</span>
              <span>{category?.name || "Sense categoria"}</span>
            </nav>

            {/* Title and metadata */}
            <header className="space-y-4">
              <h1 className="text-3xl md:text-4xl font-serif text-gray-100">
                {displayTranslation.title}
              </h1>

              <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <time dateTime={post.date.toString()}>
                    {new Date(post.date).toLocaleDateString("ca-ES", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </div>

                <div className="flex items-center gap-1">
                  <Globe className="w-4 h-4" />
                  <span>
                    {displayTranslation.language === "ca"
                      ? "Català"
                      : "English"}
                  </span>
                </div>

                {!post.is_published && (
                  <span className="px-2 py-1 bg-gray-800 text-gray-400 rounded text-xs">
                    Esborrany
                  </span>
                )}
              </div>
            </header>

            {/* Featured image */}
            {post.image && (
              <figure className="space-y-2">
                <img
                  src={post.image.url}
                  alt={post.image.alt || post.image.title}
                  className="w-full rounded-lg"
                />
                {post.image.title && (
                  <figcaption className="text-sm text-gray-400 italic text-center">
                    {post.image.title}
                  </figcaption>
                )}
              </figure>
            )}

            {/* Content */}
            <div
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: displayTranslation.content }}
            />

            {/* Keywords */}
            {displayTranslation.keywords &&
              displayTranslation.keywords.length > 0 && (
                <div className="pt-8 border-t border-gray-800">
                  <h3 className="text-sm text-gray-400 mb-3">Paraules clau</h3>
                  <div className="flex flex-wrap gap-2">
                    {displayTranslation.keywords.map((keyword) => (
                      <span
                        key={keyword.id}
                        className="flex items-center gap-1 px-3 py-1 bg-gray-900 text-gray-300 rounded text-sm"
                      >
                        <Tag className="w-3 h-3" />
                        {keyword.keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {/* References */}
            {(displayTranslation.references_images.length > 0 ||
              displayTranslation.references_texts.length > 0) && (
              <div className="pt-8 border-t border-gray-800 space-y-6">
                <h3 className="text-lg font-serif text-gray-200">
                  Referències
                </h3>

                {displayTranslation.references_images.length > 0 && (
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Imatges</h4>
                    <ul className="space-y-1">
                      {displayTranslation.references_images.map(
                        (ref, index) => (
                          <li key={index} className="text-gray-300 text-sm">
                            • {ref}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {displayTranslation.references_texts.length > 0 && (
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Textos</h4>
                    <ul className="space-y-1">
                      {displayTranslation.references_texts.map((ref, index) => (
                        <li key={index} className="text-gray-300 text-sm">
                          • {ref}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Footer metadata */}
            <footer className="pt-8 border-t border-gray-800 text-sm text-gray-400">
              <p>Publicat per {post.author?.email || "Anònim"}</p>
              <p>
                Última actualització:{" "}
                {new Date(displayTranslation.updated_at).toLocaleDateString(
                  "ca-ES"
                )}
              </p>
            </footer>
          </article>
        </div>
      </main>
    </div>
  );
};
