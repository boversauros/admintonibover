"use client";
import React, { useState, useMemo } from "react";
import { DEMO_POSTS, DEMO_IMAGES } from "../data";
import { Post, ImageData } from "../types";
import { PlusCircle, Edit, Trash, Eye, EyeOff, Image as ImageIcon } from "lucide-react";
import Link from "next/link";

const CATEGORIES = [
  { id: "perspectives", name: "Perspectives" },
  { id: "vivencies", name: "Vivencies" },
  { id: "reflexions", name: "Reflexions" },
];

const Home: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>(DEMO_POSTS);
  const [visibleConfirmDelete, setVisibleConfirmDelete] = useState<string | null>(null);

  // Create a map of image IDs to image objects for faster lookups
  const imagesMap = useMemo(() => {
    const map = new Map<string, ImageData>();
    DEMO_IMAGES.forEach(image => map.set(image.id, image));
    return map;
  }, []);

  // Function to get a thumbnail image by ID
  const getThumbnail = (post: Post): ImageData | null => {
    if (!post.thumbnail_id) return null;
    return imagesMap.get(post.thumbnail_id) || null;
  };

  const handleDeletePost = (postId: string): void => {
    setPosts(posts.filter((post) => post.id !== postId));
    setVisibleConfirmDelete(null);
  };

  const handleTogglePublishStatus = (postId: string): void => {
    setPosts(
      posts.map((post) =>
        post.id === postId ? { ...post, isPublished: !post.isPublished } : post
      )
    );
  };

  return (
    <div className="bg-black text-white min-h-screen">
      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex justify-between items-center mb-12">
            <h2 className="text-xl font-serif italic">REFLEXIONS</h2>
            <Link
              href="/posts/new"
              className="flex items-center gap-2 tracking-wide text-gray-300 hover:text-white transition-colors duration-300"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nova reflexió</span>
            </Link>
          </div>

          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white">
                  <th className="text-left p-4 text-gray-400 font-normal">
                    Miniatura
                  </th>
                  <th className="text-left p-4 text-gray-400 font-normal">
                    Títol
                  </th>
                  <th className="text-left p-4 text-gray-400 font-normal">
                    Categoria
                  </th>
                  <th className="text-left p-4 text-gray-400 font-normal">
                    Data
                  </th>
                  <th className="text-left p-4 text-gray-400 font-normal">
                    Estat
                  </th>
                  <th className="p-4 text-gray-400 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => {
                  const thumbnail = getThumbnail(post);
                  const category = CATEGORIES.find(c => c.id === post.category);
                  
                  return (
                    <React.Fragment key={post.id}>
                      <tr className="border-b border-gray-700">
                        <td className="p-2">
                          <div className="w-16 h-16 bg-gray-800 rounded overflow-hidden flex items-center justify-center">
                            {thumbnail ? (
                              <img 
                                src={thumbnail.url} 
                                alt={thumbnail.alt || thumbnail.title || 'Post thumbnail'} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-gray-500 text-xs text-center p-2">
                                <ImageIcon className="w-4 h-4 mx-auto mb-1" />
                                No thumbnail
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <Link 
                            href={`/posts/${post.id}`}
                            className="text-gray-300 hover:text-white transition-colors"
                          >
                            {post.title}
                          </Link>
                        </td>
                        <td className="p-4 text-gray-300">
                          {category?.name || post.category}
                        </td>
                        <td className="p-4 text-gray-300">
                          {new Date(post.updatedAt).toLocaleDateString('ca-ES', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 text-xs rounded ${
                            post.isPublished 
                              ? 'bg-green-900 text-green-300' 
                              : 'bg-gray-800 text-gray-400'
                          }`}>
                            {post.isPublished ? 'Publicat' : 'Esborrany'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleTogglePublishStatus(post.id)}
                              className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                              title={post.isPublished ? 'Despublicar' : 'Publicar'}
                            >
                              {post.isPublished ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                            <Link
                              href={`/posts/new?id=${post.id}`}
                              className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => setVisibleConfirmDelete(post.id)}
                              className="p-1.5 rounded hover:bg-gray-700 text-red-400 hover:text-red-300 transition-colors"
                              title="Eliminar"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {visibleConfirmDelete === post.id && (
                        <tr className="bg-gray-900">
                          <td colSpan={6} className="p-4">
                            <div className="flex justify-between items-center">
                              <p className="text-gray-300">
                                Segur que vols eliminar aquest article? Aquesta acció no es pot desfer.
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setVisibleConfirmDelete(null)}
                                  className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                                >
                                  Cancel·lar
                                </button>
                                <button
                                  onClick={() => handleDeletePost(post.id)}
                                  className="px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-100 rounded"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
