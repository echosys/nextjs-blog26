import { MongoClient } from 'mongodb';

// Fail fast (default is 30s) so status checks report errors before the serverless timeout.
const options = { serverSelectionTimeoutMS: 5000 };

let clientPromise: Promise<MongoClient> | null = null;

function getMongoClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    return Promise.reject(new Error('MONGODB_URI is not set'));
  }

  if (process.env.NODE_ENV === 'development') {
    if (!(global as any)._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      (global as any)._mongoClientPromise = client.connect().catch((error) => {
        (global as any)._mongoClientPromise = null;
        throw error;
      });
    }

    return (global as any)._mongoClientPromise;
  }

  if (!clientPromise) {
    const client = new MongoClient(uri, options);
    // Don't cache a failed connect, otherwise a warm instance stays broken after the DB resumes.
    clientPromise = client.connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

export default getMongoClientPromise;
