"use client";
import React from "react";
import Link from "next/link";
import { Post, Category } from "@/app/_lib/types";
import { ArrowLeft, Edit, Calendar, Tag, Globe } from "lucide-react";

interface PostViewProps {
  post: Post;
  category?: Category;
}

export const PostView: React.FC<PostViewProps> = ({ post, category }) => {
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

          <Link
            href={`/posts/${post.id}/edit`}
            className="flex items-center gap-1 text-gray-300 hover:text-white transition-colors"
          >
            <Edit className="w-4 h-4" />
            <span>Editar</span>
          </Link>
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
                {post.title}
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
                  <span>{post.language === "ca" ? "Català" : "English"}</span>
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
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* Keywords */}
            {post.keywords.length > 0 && (
              <div className="pt-8 border-t border-gray-800">
                <h3 className="text-sm text-gray-400 mb-3">Paraules clau</h3>
                <div className="flex flex-wrap gap-2">
                  {post.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="flex items-center gap-1 px-3 py-1 bg-gray-900 text-gray-300 rounded text-sm"
                    >
                      <Tag className="w-3 h-3" />
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* References */}
            {(post.references.images.length > 0 ||
              post.references.texts.length > 0) && (
              <div className="pt-8 border-t border-gray-800 space-y-6">
                <h3 className="text-lg font-serif text-gray-200">
                  Referències
                </h3>

                {post.references.images.length > 0 && (
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Imatges</h4>
                    <ul className="space-y-1">
                      {post.references.images.map((ref, index) => (
                        <li key={index} className="text-gray-300 text-sm">
                          • {ref}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {post.references.texts.length > 0 && (
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Textos</h4>
                    <ul className="space-y-1">
                      {post.references.texts.map((ref, index) => (
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
              <p>Publicat per {post.author || "Anònim"}</p>
              <p>
                Última actualització:{" "}
                {new Date(post.updated_at).toLocaleDateString("ca-ES")}
              </p>
            </footer>
          </article>
        </div>
      </main>
    </div>
  );
};
