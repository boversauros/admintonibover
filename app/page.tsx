"use client";
import { useState } from "react";
import { DEMO_POSTS, CATEGORIES } from "../data";
import { Post } from "../types";
import { PlusCircle, Edit, Trash, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

const Home: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>(DEMO_POSTS);
  const [visibleConfirmDelete, setVisibleConfirmDelete] = useState<
    string | null
  >(null);

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
    <div className="bg-gray-900 text-white min-h-screen">
      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex justify-between items-center mb-12">
            <h2 className="text-xl font-serif italic text-gray-200">
              REFLEXIONS
            </h2>
            <Link
              href="/posts/new"
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nova reflexió</span>
            </Link>
          </div>

          <div className="bg-gray-800 rounded overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
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
                {posts.map((post) => (
                  <React.Fragment key={post.id}>
                    <tr className="border-b border-gray-700 hover:bg-gray-700/50 group">
                      <td className="p-4">
                        <Link
                          href={`/posts/${post.id}`}
                          className="text-gray-200 hover:text-white transition-colors"
                        >
                          {post.title}
                        </Link>
                      </td>
                      <td className="p-4 text-gray-400">
                        {CATEGORIES.find((c) => c.id === post.category)?.name}
                      </td>
                      <td className="p-4 text-gray-400">{post.date}</td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            post.isPublished
                              ? "bg-gray-700 text-green-400"
                              : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {post.isPublished ? "Publicat" : "Esborrany"}
                        </span>
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex gap-1 justify-end">
                          <button
                            className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                            title={
                              post.isPublished ? "Despublicar" : "Publicar"
                            }
                            onClick={() => handleTogglePublishStatus(post.id)}
                          >
                            {post.isPublished ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                          <Link
                            href={`/posts/${post.id}`}
                            className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button
                            className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                            title="Eliminar"
                            onClick={() => setVisibleConfirmDelete(post.id)}
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {visibleConfirmDelete === post.id && (
                      <tr className="bg-gray-700">
                        <td colSpan={5} className="p-4">
                          <div className="flex justify-between items-center">
                            <p className="text-gray-300">
                              Segur que vols eliminar aquesta reflexió? Aquesta
                              acció no es pot desfer.
                            </p>
                            <div className="flex gap-3">
                              <button
                                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-gray-300 rounded"
                                onClick={() => setVisibleConfirmDelete(null)}
                              >
                                Cancel·lar
                              </button>
                              <button
                                className="px-3 py-1 bg-red-900 hover:bg-red-800 text-red-200 rounded"
                                onClick={() => handleDeletePost(post.id)}
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
