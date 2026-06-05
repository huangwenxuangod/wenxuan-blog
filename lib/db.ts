export { getDB, ensureSchema, type Database } from '@/lib/repositories/schema'
export {
  isPubliclyAccessiblePost,
  isSearchIndexablePost,
  type CategoryRow,
  type CountRow,
  type Post,
  type PostAiSnapshotRow,
  type PostCategoryRow,
  type PostWithTags,
  type SettingRow,
  type StatsRow,
} from '@/lib/repositories/types'
export { mapPostWithTags, normalizePostStatus, parsePostTags } from '@/lib/repositories/post-mappers'
export {
  createPost,
  deletePost,
  getPostAiSnapshot,
  getPostBySlug,
  getPosts,
  getPostsByCategory,
  getPostsCount,
  getPostsCountByCategory,
  getStats,
  incrementViewCount,
  permanentlyDeletePost,
  restorePost,
  updatePost,
  updatePostBySlug,
} from '@/lib/repositories/posts'
export { searchPosts } from '@/lib/repositories/search'
export {
  createCategory,
  deleteCategory,
  getCategories,
  getPublicCategories,
  updateCategory,
} from '@/lib/repositories/categories'
export { getSetting, setSetting } from '@/lib/repositories/settings'
export {
  appendAiArticleMessage,
  getOrCreateAiArticleThread,
  listAiArticleMessages,
  normalizeArticleKey,
  resetAiArticleThread,
  type AiArticleMessageRow,
  type AiArticleThreadRow,
} from '@/lib/repositories/ai-article-threads'
export {
  listAiArticleMemoryItems,
  upsertAiArticleMemoryItem,
  type AiArticleMemoryRow,
} from '@/lib/repositories/ai-article-memory'
