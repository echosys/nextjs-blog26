import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { ObjectId } from 'mongodb';
import getMongoClientPromise from './mongodb';
import { pgDb } from './pg';
import { getRuntimeStorageConfig } from './runtimeConfig';
import { logError, logInfo } from './logger';

type StatusResult = {
  status: 'ok' | 'error';
  mode: string;
  label: string;
  host: string;
  message?: string;
};

type JsonUserRecord = {
  login: string;
  pw: string;
};

type JsonUserFile = {
  users?: JsonUserRecord[];
  localLogin?: string;
  localPhrase?: string;
};

type JsonBlogRecord = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt?: string;
  attachment?: string;
  attachmentName?: string;
  attachmentChunks?: string[];
};

type JsonBlogFile = {
  posts?: JsonBlogRecord[];
};

type MongoBlogInput = {
  title: string;
  content: string;
  attachment?: string;
  attachmentName?: string;
  tags?: string[] | string;
};

type PgBlogInput = {
  id?: number;
  title: string;
  content: string;
  tags?: string[] | string;
  attachment_name?: string | null;
  attachment_data?: string | null;
  clear_attachment?: boolean;
};

const TAG_CACHE_FILTER = { documentType: 'tag-cache' };

function ensureArrayTags(tags?: string[] | string): string[] {
  if (Array.isArray(tags)) {
    return tags.map((tag) => tag.trim()).filter(Boolean);
  }

  return (tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getAbsoluteConfigPath(relativePath: string) {
  return path.join(process.cwd(), relativePath);
}

async function readJsonDocument<T>(relativePath: string, fallback: T): Promise<T> {
  try {
    const contents = await readFile(getAbsoluteConfigPath(relativePath), 'utf8');
    return JSON.parse(contents) as T;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      await logError('storage.json', 'Failed to read JSON document', { relativePath, message: error.message });
    }
    return fallback;
  }
}

async function writeJsonDocument(relativePath: string, value: unknown) {
  await writeFile(getAbsoluteConfigPath(relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseMongoHost(uri: string | undefined): string {
  if (!uri) {
    return 'not configured';
  }

  try {
    const normalized = uri.startsWith('mongodb+srv://') ? uri.replace('mongodb+srv://', 'https://') : uri.replace('mongodb://', 'http://');
    const url = new URL(normalized);
    return url.host;
  } catch {
    return 'configured';
  }
}

function parsePostgresHost(uri: string | undefined): string {
  if (!uri) {
    return 'not configured';
  }

  try {
    return new URL(uri).host;
  } catch {
    return 'configured';
  }
}

function normalizeJsonUsers(userFile: JsonUserFile): JsonUserRecord[] {
  if (Array.isArray(userFile.users)) {
    return userFile.users.filter((user) => user.login && user.pw);
  }

  if (userFile.localLogin && userFile.localPhrase) {
    return [{ login: userFile.localLogin, pw: userFile.localPhrase }];
  }

  return [];
}

async function readJsonUsers(host?: string | null): Promise<JsonUserRecord[]> {
  const { json, runtime } = getRuntimeStorageConfig(host);
  const userFile = await readJsonDocument<JsonUserFile>(json.loginFile, { users: [] });
  const users = normalizeJsonUsers(userFile);
  await logInfo('storage.auth', 'Loaded JSON users', { runtime, count: users.length, file: json.loginFile });
  return users;
}

async function readJsonBlogs(host?: string | null, fileType: 'mongo' | 'postgres' = 'mongo'): Promise<JsonBlogRecord[]> {
  const { json, runtime } = getRuntimeStorageConfig(host);
  const blogFile = fileType === 'mongo' ? json.mongoBlogFile : json.postgresBlogFile;
  const doc = await readJsonDocument<JsonBlogFile>(blogFile, { posts: [] });
  const posts = Array.isArray(doc.posts) ? doc.posts : [];
  await logInfo('storage.blog', 'Loaded JSON blog file', { runtime, count: posts.length, file: blogFile, fileType });
  return posts;
}

async function writeJsonBlogs(posts: JsonBlogRecord[], host?: string | null, fileType: 'mongo' | 'postgres' = 'mongo') {
  const { json, runtime } = getRuntimeStorageConfig(host);
  const blogFile = fileType === 'mongo' ? json.mongoBlogFile : json.postgresBlogFile;
  await writeJsonDocument(blogFile, { posts });
  await logInfo('storage.blog', 'Persisted JSON blog file', { runtime, count: posts.length, file: blogFile, fileType });
}

function collectTags(posts: Array<{ tags?: string[] }>): string[] {
  return Array.from(new Set(posts.flatMap((post) => post.tags || []).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function mapJsonToMongoBlog(post: JsonBlogRecord) {
  const attachmentPayload = post.attachment || ((post.attachmentChunks || []).length > 0
    ? `data:application/octet-stream;base64,${(post.attachmentChunks || []).join('')}`
    : '');

  return {
    _id: post.id,
    title: post.title,
    content: post.content,
    attachment: attachmentPayload,
    attachmentName: post.attachmentName || '',
    tags: post.tags || [],
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function mapJsonToPgBlog(post: JsonBlogRecord) {
  return {
    id: Number(post.id),
    title: post.title,
    content: post.content,
    tags: post.tags || [],
    attachment_name: post.attachmentName || null,
    created_at: post.createdAt,
    updated_at: post.updatedAt || null,
  };
}

function assertSqlIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }

  return `"${name}"`;
}

async function getMongoCollections(host?: string | null) {
  const { mongo, runtime } = getRuntimeStorageConfig(host);
  const client = await getMongoClientPromise();
  const db = client.db(mongo.databaseName);
  const existingCollections = await db.listCollections({}, { nameOnly: true }).toArray();
  const existingNames = new Set(existingCollections.map((collection) => collection.name));

  if (!existingNames.has(mongo.loginCollection)) {
    await db.createCollection(mongo.loginCollection);
  }

  if (!existingNames.has(mongo.blogCollection)) {
    await db.createCollection(mongo.blogCollection);
  }

  const loginCollection = db.collection(mongo.loginCollection);
  await loginCollection.updateOne(
    TAG_CACHE_FILTER,
    { $setOnInsert: { ...TAG_CACHE_FILTER, tags: [] } },
    { upsert: true }
  );

  await logInfo('storage.mongo', 'Ensured Mongo collections', {
    runtime,
    databaseName: mongo.databaseName,
    loginCollection: mongo.loginCollection,
    blogCollection: mongo.blogCollection,
  });

  return {
    db,
    loginCollection,
    blogCollection: db.collection(mongo.blogCollection),
  };
}

async function syncMongoTagCache(host?: string | null) {
  const { loginCollection, blogCollection } = await getMongoCollections(host);
  const tags = ((await blogCollection.distinct('tags')) as string[])
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  await loginCollection.updateOne(TAG_CACHE_FILTER, { $set: { tags } }, { upsert: true });
}

async function ensurePostgresSchema(host?: string | null) {
  const { postgres, runtime } = getRuntimeStorageConfig(host);
  const postsTable = assertSqlIdentifier(postgres.blogTable);
  const chunksTable = assertSqlIdentifier(postgres.attachmentTable);

  await pgDb.query(`
    CREATE TABLE IF NOT EXISTS ${postsTable} (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      attachment_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    )
  `);
  await pgDb.query(`
    CREATE TABLE IF NOT EXISTS ${chunksTable} (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES ${postsTable}(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      data TEXT NOT NULL,
      UNIQUE (post_id, chunk_index)
    )
  `);
  await pgDb.query(`CREATE INDEX IF NOT EXISTS idx_${postgres.blogTable}_created_at ON ${postsTable} (created_at DESC)`);
  await pgDb.query(`CREATE INDEX IF NOT EXISTS idx_${postgres.blogTable}_tags ON ${postsTable} USING GIN (tags)`);
  await pgDb.query(`CREATE INDEX IF NOT EXISTS idx_${postgres.attachmentTable}_post_id ON ${chunksTable} (post_id, chunk_index)`);

  await logInfo('storage.postgres', 'Ensured Postgres tables', {
    runtime,
    blogTable: postgres.blogTable,
    attachmentTable: postgres.attachmentTable,
  });

  return {
    postsTable,
    chunksTable,
  };
}

export async function authenticateUser(login: string, pw: string, host?: string | null) {
  const { loginMode, runtime } = getRuntimeStorageConfig(host);
  await logInfo('storage.auth', 'Authenticating user', { runtime, loginMode, login });

  if (loginMode === 'json') {
    const users = await readJsonUsers(host);
    return users.some((user) => user.login === login && user.pw === pw);
  }

  const { loginCollection } = await getMongoCollections(host);
  const user = await loginCollection.findOne({ login, pw });
  return Boolean(user);
}

export async function getLoginStatus(host?: string | null): Promise<StatusResult> {
  const { loginMode, json } = getRuntimeStorageConfig(host);

  if (loginMode === 'json') {
    return {
      status: 'ok',
      mode: loginMode,
      label: 'JSON file',
      host: json.loginFile,
    };
  }

  if (!process.env.MONGODB_URI) {
    return {
      status: 'error',
      mode: loginMode,
      label: 'MongoDB',
      host: 'not configured',
      message: 'MONGODB_URI is not configured',
    };
  }

  try {
    await getMongoCollections(host);
    return {
      status: 'ok',
      mode: loginMode,
      label: 'MongoDB',
      host: parseMongoHost(process.env.MONGODB_URI),
    };
  } catch (error: any) {
    await logError('storage.auth', 'Mongo login status failed', { message: error.message });
    return {
      status: 'error',
      mode: loginMode,
      label: 'MongoDB',
      host: parseMongoHost(process.env.MONGODB_URI),
      message: error.message,
    };
  }
}

export async function getPostgresStatus(host?: string | null): Promise<StatusResult> {
  const { postgresBlogMode, json } = getRuntimeStorageConfig(host);

  if (postgresBlogMode === 'json') {
    return {
      status: 'ok',
      mode: postgresBlogMode,
      label: 'JSON file',
      host: json.postgresBlogFile,
    };
  }

  if (!process.env.POSTGRES_URL) {
    return {
      status: 'error',
      mode: postgresBlogMode,
      label: 'Postgres',
      host: 'not configured',
      message: 'POSTGRES_URL is not configured',
    };
  }

  try {
    await ensurePostgresSchema(host);
    await pgDb.query('SELECT 1');
    return {
      status: 'ok',
      mode: postgresBlogMode,
      label: 'Postgres',
      host: parsePostgresHost(process.env.POSTGRES_URL),
    };
  } catch (error: any) {
    await logError('storage.postgres', 'Postgres status failed', { message: error.message });
    return {
      status: 'error',
      mode: postgresBlogMode,
      label: 'Postgres',
      host: parsePostgresHost(process.env.POSTGRES_URL),
      message: error.message,
    };
  }
}

export async function getMongoTags(host?: string | null): Promise<string[]> {
  const { mongoBlogMode } = getRuntimeStorageConfig(host);

  if (mongoBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'mongo');
    return collectTags(posts);
  }

  const { loginCollection } = await getMongoCollections(host);
  const result = await loginCollection.findOne(TAG_CACHE_FILTER, { projection: { tags: 1, _id: 0 } });
  return Array.isArray(result?.tags) ? result.tags : [];
}

export async function listMongoBlogs(
  params: { page?: number; limit?: number; tag?: string; host?: string | null } = {}
) {
  const { mongoBlogMode } = getRuntimeStorageConfig(params.host);
  const page = params.page || 1;
  const limit = params.limit || 15;
  const skip = (page - 1) * limit;
  const normalizedTag = params.tag && params.tag !== 'all' ? params.tag : '';
  const tagList = normalizedTag
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (mongoBlogMode === 'json') {
    const posts = await readJsonBlogs(params.host, 'mongo');
    const filteredPosts = tagList.length === 0
      ? posts
      : posts.filter((post) => tagList.every((tag) => post.tags.includes(tag)));
    const sortedPosts = [...filteredPosts].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const blogs = sortedPosts.slice(skip, skip + limit).map(mapJsonToMongoBlog);
    const total = sortedPosts.length;

    return {
      blogs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  const { blogCollection } = await getMongoCollections(params.host);
  const query = tagList.length > 0 ? { tags: { $all: tagList } } : {};
  const blogs = await blogCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
  const total = await blogCollection.countDocuments(query);

  return {
    blogs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getMongoBlogById(id: string, host?: string | null) {
  const { mongoBlogMode } = getRuntimeStorageConfig(host);

  if (mongoBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'mongo');
    const post = posts.find((entry) => entry.id === id);
    return post ? mapJsonToMongoBlog(post) : null;
  }

  const { blogCollection } = await getMongoCollections(host);
  const query: any = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
  return blogCollection.findOne(query);
}

export async function createMongoBlog(input: MongoBlogInput, host?: string | null) {
  const { mongoBlogMode, runtime } = getRuntimeStorageConfig(host);
  const tags = ensureArrayTags(input.tags);

  if (mongoBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'mongo');
    const nextId = posts.reduce((maxValue, post) => Math.max(maxValue, Number(post.id) || 0), 0) + 1;
    const post: JsonBlogRecord = {
      id: String(nextId),
      title: input.title,
      content: input.content,
      tags,
      attachment: input.attachment || '',
      attachmentName: input.attachmentName || '',
      createdAt: new Date().toISOString(),
    };
    posts.unshift(post);
    await writeJsonBlogs(posts, host, 'mongo');
    await logInfo('storage.mongoBlog', 'Created JSON blog post', { runtime, id: post.id, title: post.title });
    return { insertedId: post.id };
  }

  const { blogCollection } = await getMongoCollections(host);
  const result = await blogCollection.insertOne({
    title: input.title,
    content: input.content,
    attachment: input.attachment || '',
    attachmentName: input.attachmentName || '',
    tags,
    createdAt: new Date(),
  });
  await syncMongoTagCache(host);
  await logInfo('storage.mongoBlog', 'Created Mongo blog post', { runtime, id: String(result.insertedId), title: input.title });
  return result;
}

export async function updateMongoBlog(id: string, input: MongoBlogInput, host?: string | null) {
  const { mongoBlogMode, runtime } = getRuntimeStorageConfig(host);
  const tags = ensureArrayTags(input.tags);

  if (mongoBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'mongo');
    const updatedPosts = posts.map((post) => {
      if (post.id !== id) {
        return post;
      }

      return {
        ...post,
        title: input.title,
        content: input.content,
        tags,
        attachment: input.attachment || '',
        attachmentName: input.attachmentName || '',
        updatedAt: new Date().toISOString(),
      };
    });
    await writeJsonBlogs(updatedPosts, host, 'mongo');
    await logInfo('storage.mongoBlog', 'Updated JSON blog post', { runtime, id, title: input.title });
    return { matchedCount: 1, modifiedCount: 1 };
  }

  const { blogCollection } = await getMongoCollections(host);
  const query: any = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
  const result = await blogCollection.updateOne(query, {
    $set: {
      title: input.title,
      content: input.content,
      attachment: input.attachment || '',
      attachmentName: input.attachmentName || '',
      tags,
      updatedAt: new Date(),
    },
  });
  await syncMongoTagCache(host);
  await logInfo('storage.mongoBlog', 'Updated Mongo blog post', { runtime, id, title: input.title });
  return result;
}

export async function deleteMongoBlog(id: string, host?: string | null) {
  const { mongoBlogMode, runtime } = getRuntimeStorageConfig(host);

  if (mongoBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'mongo');
    const nextPosts = posts.filter((post) => post.id !== id);
    await writeJsonBlogs(nextPosts, host, 'mongo');
    await logInfo('storage.mongoBlog', 'Deleted JSON blog post', { runtime, id });
    return { deletedCount: posts.length === nextPosts.length ? 0 : 1 };
  }

  const { blogCollection } = await getMongoCollections(host);
  const query: any = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
  const result = await blogCollection.deleteOne(query);
  await syncMongoTagCache(host);
  await logInfo('storage.mongoBlog', 'Deleted Mongo blog post', { runtime, id });
  return result;
}

export async function listPgBlogs(params: { tag?: string; host?: string | null } = {}) {
  const { postgresBlogMode } = getRuntimeStorageConfig(params.host);
  const activeTag = params.tag && params.tag !== 'all' ? params.tag : undefined;

  if (postgresBlogMode === 'json') {
    const posts = await readJsonBlogs(params.host, 'postgres');
    const filtered = activeTag ? posts.filter((post) => post.tags.includes(activeTag)) : posts;
    const sorted = [...filtered].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return {
      posts: sorted.map(mapJsonToPgBlog),
      tags: collectTags(posts),
    };
  }

  const { postsTable } = await ensurePostgresSchema(params.host);
  const paramsList: unknown[] = [];
  let query = `SELECT id, title, content, attachment_name, tags, created_at, updated_at FROM ${postsTable}`;
  if (activeTag) {
    query += ' WHERE $1 = ANY(tags)';
    paramsList.push(activeTag);
  }
  query += ' ORDER BY created_at DESC';

  const result = await pgDb.query(query, paramsList);
  const tagsResult = await pgDb.query(`SELECT DISTINCT unnest(tags) AS tag FROM ${postsTable} ORDER BY tag ASC`);
  return {
    posts: result.rows,
    tags: tagsResult.rows.map((row: any) => row.tag).filter(Boolean),
  };
}

export async function getPgBlogById(id: number, host?: string | null) {
  const { postgresBlogMode } = getRuntimeStorageConfig(host);

  if (postgresBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'postgres');
    const post = posts.find((entry) => Number(entry.id) === id);
    return post ? mapJsonToPgBlog(post) : null;
  }

  const { postsTable } = await ensurePostgresSchema(host);
  const result = await pgDb.query(
    `SELECT id, title, content, attachment_name, tags, created_at, updated_at FROM ${postsTable} WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createPgBlog(input: PgBlogInput, host?: string | null) {
  const { postgresBlogMode, runtime } = getRuntimeStorageConfig(host);
  const tags = ensureArrayTags(input.tags);

  if (postgresBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'postgres');
    const nextId = posts.reduce((maxValue, post) => Math.max(maxValue, Number(post.id) || 0), 0) + 1;
    const post: JsonBlogRecord = {
      id: String(nextId),
      title: input.title,
      content: input.content,
      tags,
      attachment: input.attachment_data ? `data:application/octet-stream;base64,${input.attachment_data}` : '',
      attachmentName: input.attachment_name || '',
      attachmentChunks: input.attachment_data ? [input.attachment_data] : [],
      createdAt: new Date().toISOString(),
    };
    posts.unshift(post);
    await writeJsonBlogs(posts, host, 'postgres');
    await logInfo('storage.pgBlog', 'Created JSON PG-style blog post', { runtime, id: nextId, title: post.title });
    return { id: nextId };
  }

  const { postsTable, chunksTable } = await ensurePostgresSchema(host);
  const result = await pgDb.query(
    `INSERT INTO ${postsTable} (title, content, tags, attachment_name, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
    [input.title, input.content, tags, input.attachment_name || null]
  );
  const postId = result.rows[0].id;

  if (input.attachment_data) {
    await pgDb.query(`INSERT INTO ${chunksTable} (post_id, chunk_index, data) VALUES ($1, $2, $3)`, [postId, 0, input.attachment_data]);
  }

  await logInfo('storage.pgBlog', 'Created Postgres blog post', { runtime, id: postId, title: input.title });
  return { id: postId };
}

export async function updatePgBlog(input: PgBlogInput, host?: string | null) {
  const { postgresBlogMode, runtime } = getRuntimeStorageConfig(host);
  const tags = ensureArrayTags(input.tags);
  const id = Number(input.id);

  if (postgresBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'postgres');
    const updatedPosts = posts.map((post) => {
      if (Number(post.id) !== id) {
        return post;
      }

      return {
        ...post,
        title: input.title,
        content: input.content,
        tags,
        attachment: input.clear_attachment ? '' : post.attachment || '',
        attachmentName: input.clear_attachment ? '' : input.attachment_name || post.attachmentName || '',
        attachmentChunks: input.clear_attachment ? [] : post.attachmentChunks || [],
        updatedAt: new Date().toISOString(),
      };
    });
    await writeJsonBlogs(updatedPosts, host, 'postgres');
    await logInfo('storage.pgBlog', 'Updated JSON PG-style blog post', { runtime, id, title: input.title });
    return { success: true };
  }

  const { postsTable, chunksTable } = await ensurePostgresSchema(host);
  if (input.clear_attachment) {
    await pgDb.query(
      `UPDATE ${postsTable} SET title = $1, content = $2, tags = $3, attachment_name = $4, updated_at = NOW() WHERE id = $5`,
      [input.title, input.content, tags, null, id]
    );
    await pgDb.query(`DELETE FROM ${chunksTable} WHERE post_id = $1`, [id]);
  } else {
    await pgDb.query(
      `UPDATE ${postsTable} SET title = $1, content = $2, tags = $3, attachment_name = $4, updated_at = NOW() WHERE id = $5`,
      [input.title, input.content, tags, input.attachment_name || null, id]
    );
  }

  if (input.attachment_data) {
    await pgDb.query(`DELETE FROM ${chunksTable} WHERE post_id = $1`, [id]);
    await pgDb.query(`INSERT INTO ${chunksTable} (post_id, chunk_index, data) VALUES ($1, $2, $3)`, [id, 0, input.attachment_data]);
  }

  await logInfo('storage.pgBlog', 'Updated Postgres blog post', { runtime, id, title: input.title });
  return { success: true };
}

export async function deletePgBlog(id: number, host?: string | null) {
  const { postgresBlogMode, runtime } = getRuntimeStorageConfig(host);

  if (postgresBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'postgres');
    const nextPosts = posts.filter((post) => Number(post.id) !== id);
    await writeJsonBlogs(nextPosts, host, 'postgres');
    await logInfo('storage.pgBlog', 'Deleted JSON PG-style blog post', { runtime, id });
    return { success: true };
  }

  const { postsTable, chunksTable } = await ensurePostgresSchema(host);
  await pgDb.query(`DELETE FROM ${chunksTable} WHERE post_id = $1`, [id]);
  await pgDb.query(`DELETE FROM ${postsTable} WHERE id = $1`, [id]);
  await logInfo('storage.pgBlog', 'Deleted Postgres blog post', { runtime, id });
  return { success: true };
}

export async function uploadPgChunk(id: number, index: number, data: string, host?: string | null) {
  const { postgresBlogMode, runtime } = getRuntimeStorageConfig(host);

  if (postgresBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'postgres');
    const nextPosts = posts.map((post) => {
      if (Number(post.id) !== id) {
        return post;
      }

      const attachmentChunks = [...(post.attachmentChunks || [])];
      attachmentChunks[index] = data;
      return {
        ...post,
        attachment: `data:application/octet-stream;base64,${attachmentChunks.join('')}`,
        attachmentChunks,
        updatedAt: new Date().toISOString(),
      };
    });
    await writeJsonBlogs(nextPosts, host, 'postgres');
    await logInfo('storage.pgBlog', 'Stored JSON attachment chunk', { runtime, id, index });
    return { success: true };
  }

  const { chunksTable } = await ensurePostgresSchema(host);
  await pgDb.query(
    `INSERT INTO ${chunksTable} (post_id, chunk_index, data) VALUES ($1, $2, $3)
     ON CONFLICT (post_id, chunk_index) DO UPDATE SET data = EXCLUDED.data`,
    [id, index, data]
  );
  await logInfo('storage.pgBlog', 'Stored Postgres attachment chunk', { runtime, id, index });
  return { success: true };
}

export async function getPgAttachment(id: number, host?: string | null) {
  const { postgresBlogMode } = getRuntimeStorageConfig(host);

  if (postgresBlogMode === 'json') {
    const posts = await readJsonBlogs(host, 'postgres');
    const post = posts.find((entry) => Number(entry.id) === id);
    if (!post || !post.attachmentName) {
      return null;
    }

    const base64Payload = (post.attachmentChunks || []).join('') || (post.attachment?.split(',')[1] || '');
    return {
      attachmentName: post.attachmentName,
      buffer: Buffer.from(base64Payload, 'base64'),
    };
  }

  const { postsTable, chunksTable } = await ensurePostgresSchema(host);
  const postResult = await pgDb.query(`SELECT attachment_name FROM ${postsTable} WHERE id = $1`, [id]);
  const post = postResult.rows[0];
  if (!post?.attachment_name) {
    return null;
  }

  const chunkResult = await pgDb.query(`SELECT data FROM ${chunksTable} WHERE post_id = $1 ORDER BY chunk_index ASC`, [id]);
  const fullData = chunkResult.rows.map((row: any) => row.data).join('');

  return {
    attachmentName: post.attachment_name,
    buffer: Buffer.from(fullData, 'base64'),
  };
}