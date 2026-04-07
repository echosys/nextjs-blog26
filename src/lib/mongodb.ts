import { MongoClient } from 'mongodb';

const options = {};

let clientPromise: Promise<MongoClient> | null = null;

function getMongoClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    return Promise.reject(new Error('MONGODB_URI is not set'));
  }

  if (process.env.NODE_ENV === 'development') {
    if (!(global as any)._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      (global as any)._mongoClientPromise = client.connect();
    }

    return (global as any)._mongoClientPromise;
  }

  if (!clientPromise) {
    const client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }

  return clientPromise;
}

export default getMongoClientPromise;
