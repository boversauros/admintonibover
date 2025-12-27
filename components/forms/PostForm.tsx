'use client';

import { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { Button } from '@/components/ui';
import { PostFormData, StoredPost, Language } from '@/lib/types/post';
import { slugify, generateUniqueSlug } from '@/lib/utils/slugify';
import { getPosts, savePosts, generatePostId, getExistingSlugs } from '@/lib/utils/localStorage';
import { postValidationRules } from '@/lib/validation/postSchema';
import { LanguageTabs } from './LanguageTabs';
import { PostMetadataSection } from './PostMetadataSection';
import { TranslationSection } from './TranslationSection';
import { ImageSection } from './ImageSection';
import { KeywordsSection } from './KeywordsSection';
import { ReferencesSection } from './ReferencesSection';

export function PostForm() {
  const [activeLanguage, setActiveLanguage] = useState<Language>('ca');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const methods = useForm<PostFormData>({
    defaultValues: {
      category_id: '',
      date: '',
      author: '',
      thumbnail_url: '',
      is_published: false,
      translations: {
        ca: {
          language: 'ca',
          title: '',
          content: '',
          slug: '',
          keywords: [],
          references: [],
        },
        en: {
          language: 'en',
          title: '',
          content: '',
          slug: '',
          keywords: [],
          references: [],
        },
      },
    },
    mode: 'onChange',
  });

  const { watch, setValue, handleSubmit, reset } = methods;

  // Auto-generate slugs from titles
  const titleCA = watch('translations.ca.title');
  const titleEN = watch('translations.en.title');
  const slugCA = watch('translations.ca.slug');
  const slugEN = watch('translations.en.slug');

  useEffect(() => {
    if (titleCA) {
      const generatedSlug = slugify(titleCA);
      // Only update if slug is empty or matches the previously generated slug
      if (!slugCA || slugCA === slugify(watch('translations.ca.title'))) {
        setValue('translations.ca.slug', generatedSlug);
      }
    }
  }, [titleCA]);

  useEffect(() => {
    if (titleEN) {
      const generatedSlug = slugify(titleEN);
      if (!slugEN || slugEN === slugify(watch('translations.en.title'))) {
        setValue('translations.en.slug', generatedSlug);
      }
    }
  }, [titleEN]);

  const onSubmit = async (data: PostFormData) => {
    try {
      const postId = generatePostId();
      const now = new Date().toISOString();

      // Ensure unique slugs
      const existingSlugsCA = getExistingSlugs('ca');
      const existingSlugsEN = getExistingSlugs('en');

      const uniqueSlugCA = generateUniqueSlug(data.translations.ca.slug, existingSlugsCA);
      const uniqueSlugEN = generateUniqueSlug(data.translations.en.slug, existingSlugsEN);

      // TODO: Get actual user from session
      // For now using placeholder
      const currentUser = 'temp-user-id';
      const authorName = 'Current User'; // TODO: Get from session

      const storedPost: StoredPost = {
        id: postId,
        user_id: currentUser,
        category_id: data.category_id,
        thumbnail_url: data.thumbnail_url,
        is_published: data.is_published,
        date: now.split('T')[0], // Set to current date automatically
        author: authorName, // Set from session automatically
        created_at: now,
        updated_at: now,
        translations: {
          ca: {
            ...data.translations.ca,
            slug: uniqueSlugCA,
            post_id: postId,
          },
          en: {
            ...data.translations.en,
            slug: uniqueSlugEN,
            post_id: postId,
          },
        },
      };

      const currentPosts = getPosts();
      savePosts([...currentPosts, storedPost]);

      setSubmitSuccess(true);
      reset();

      // Reset success message after 3 seconds
      setTimeout(() => setSubmitSuccess(false), 3000);

      console.log('Post saved successfully:', storedPost);
    } catch (error: any) {
      console.error('Error saving post:', error);
      alert(error.message || 'Failed to save post');
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {submitSuccess && (
          <div className="bg-accent text-black p-4 rounded">
            Post saved successfully!
          </div>
        )}

        <PostMetadataSection />

        <div className="border-t border-default pt-8">
          <h3 className="text-lg font-medium mb-4">Content</h3>
          <LanguageTabs active={activeLanguage} onChange={setActiveLanguage} />
          <TranslationSection language={activeLanguage} />
        </div>

        <div className="border-t border-default pt-8">
          <KeywordsSection language={activeLanguage} />
        </div>

        <div className="border-t border-default pt-8">
          <ReferencesSection language={activeLanguage} />
        </div>

        <div className="border-t border-default pt-8">
          <ImageSection />
        </div>

        <div className="flex gap-4">
          <Button type="submit" variant="ghost">
            Save Post
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => reset()}
          >
            Reset Form
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
