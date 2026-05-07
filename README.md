# Firestore ODM 🔥

> A TypeScript ODM for Firestore, inspired by [Prisma](https://www.prisma.io) developer experience.

[![NPM version](https://img.shields.io/npm/v/@vorisc/firestore-odm?style=flat)](https://www.npmjs.com/package/@vorisc/firestore-odm)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org)
[![License](https://img.shields.io/npm/l/@vorisc/firestore-odm?style=flat)](./LICENSE)

`@vorisc/firestore-odm` brings a Prisma-like developer experience to Google Firestore. It provides typed repositories, expressive queries, automatic return type inference with `select` and `omit`, transactions, batch writes, aggregations, pagination, field defaults, and emulator support.

If you like Prisma's API but need Firestore as your database, this package gives you a familiar way to model and query your data without losing Firestore's flexibility.

```ts
const user = await db.users.findUniqueOrThrow({
  where: { id: 'x0sDDPL3viYqoZKPsuu1' },
})

const orders = await db.orders.findMany({
  where: {
    status: 'pending',
    total: { gt: 100 },
  },
  orderBy: { createdAt: 'desc' },
  take: 20,
})

await db.$transaction(async (tx) => {
  const sender = await tx.users.findUniqueOrThrow({
    where: { id: senderId },
  })

  if (sender.balance < amount) {
    throw new Error('Insufficient funds')
  }

  tx.users.update({
    where: { id: senderId },
    data: { balance: sender.balance - amount },
  })
})
```

---

## Why Firestore ODM?

Firestore is flexible and scalable, but building a consistent data access layer can become repetitive as an application grows. This ODM helps you centralize your query logic in typed repositories while keeping the API simple and predictable.

It is especially useful when you want:

- A Prisma-like API on top of Firestore
- Strong TypeScript inference for query results
- Reusable repositories with domain-specific methods
- Safer `select` and `omit` usage without manual casting
- A consistent pattern for reads, writes, transactions, and batch operations
- Cleaner application code with less repeated Firestore boilerplate

---

## Features

- **Prisma-like API** — `findMany`, `findUnique`, `findFirst`, `create`, `update`, `upsert`, `delete`, and more
- **Full TypeScript inference** — return types narrow automatically based on `select` and `omit`
- **Expressive `where` clauses** — supports comparisons, inclusion filters, array filters, and logical operators
- **Pagination support** — `take`, `skip`, and cursor-based pagination with `cursor: { id }`
- **Bulk operations** — `createMany`, `updateMany`, and `deleteMany` with automatic 500-document batching
- **Aggregations** — `_count`, `_sum`, and `_avg` powered by Firestore AggregateQuery
- **Transactions** — `$transaction` with typed repositories inside the transaction context
- **Batch writes** — `$batch` for write-only atomic operations
- **Auto timestamps** — automatic `createdAt` and `updatedAt` fields
- **Field defaults** — define default values per repository
- **Repository extension** — add custom domain methods to each repository
- **Emulator support** — connect to the Firestore emulator during local development

---

## Requirements

- Node.js `>= 22`
- `firebase-admin`
- A Firebase service account or Firestore emulator setup

---

## Installation

```bash
npm install @vorisc/firestore-odm firebase-admin
```

Using pnpm:

```bash
pnpm add @vorisc/firestore-odm firebase-admin
```

Using yarn:

```bash
yarn add @vorisc/firestore-odm firebase-admin
```

---

## Quick Start

### 1. Define your model

Create a repository by extending `BaseRepository` with your document type and create-input type.

```ts
// repositories/users.repository.ts
import { BaseRepository } from '@vorisc/firestore-odm'
import type { Timestamp } from 'firebase-admin/firestore'

interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  createdAt: Timestamp
  updatedAt: Timestamp
}

type CreateUser = Omit<User, 'id' | 'createdAt' | 'updatedAt'>

export class UsersRepository extends BaseRepository<User, CreateUser> {
  constructor() {
    // Use null to connect to Firestore's default database: "(default)".
    // Provide a database ID when you want to connect to a specific Firestore database.
    const databaseId = null
    const defaults = { role: 'member' as const }

    super('users', databaseId, defaults)
  }
}
```

---

### 2. Create the ODM client

Register your repositories and initialize the client with your Firebase credentials.

```ts
// db.ts
import { createOdmClient } from '@vorisc/firestore-odm'

import { OrdersRepository } from './repositories/orders.repository'
import { UsersRepository } from './repositories/users.repository'

const repositories = {
  users: new UsersRepository(),
  orders: new OrdersRepository(),
}

export const db = createOdmClient(repositories, {
  serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT!,
  // database: 'my-database-id', // optional — defaults to '(default)'
})
```

`FIREBASE_SERVICE_ACCOUNT` should be a JSON string containing your Firebase service account credentials.

---

### 3. Query your data

```ts
import { db } from './db'

const user = await db.users.findUniqueOrThrow({
  where: { id: 'x0sDDPL3viYqoZKPsuu1' },
})

const admins = await db.users.findMany({
  where: { role: 'admin' },
  orderBy: { createdAt: 'desc' },
  take: 10,
})
```

---

## API Reference

### Find methods

```ts
// Returns null when no document is found
repo.findUnique({ where: { id }, select, omit })
repo.findFirst({ where, orderBy, select, omit })
repo.findMany({ where, orderBy, take, skip, cursor, select, omit })

// Throws NotFoundError when no document is found
repo.findUniqueOrThrow({ where: { id } })
repo.findFirstOrThrow({ where })

// Counts documents matching the filter
repo.count({ where })
```

Examples:

```ts
const user = await db.users.findUnique({
  where: { id: 'user_123' },
})

const activeUsers = await db.users.findMany({
  where: { status: 'active' },
  orderBy: { createdAt: 'desc' },
  take: 20,
})
```

---

### Write methods

```ts
repo.create({ data })
repo.createMany({ data: [...] })
repo.update({ where, data })
repo.updateMany({ where, data })
repo.upsert({ where, create, update })
repo.delete({ where: { id } })
repo.deleteMany({ where })
```

Examples:

```ts
const user = await db.users.create({
  data: {
    name: 'Alice',
    email: 'alice@example.com',
    role: 'member',
  },
})

await db.users.update({
  where: { id: user.id },
  data: { role: 'admin' },
})
```

> `deleteMany` can remove an entire collection when `where` is omitted. Use it carefully.

---

## Where Operators

Firestore ODM supports direct equality filters, comparison operators, inclusion filters, array filters, and logical operators.

### Equality

```ts
await db.users.findMany({
  where: { status: 'active' },
})
```

You can also use the explicit `equals` and `notEquals` operators:

```ts
await db.users.findMany({
  where: { status: { equals: 'active' } },
})

await db.users.findMany({
  where: { status: { notEquals: 'deleted' } },
})
```

### Comparison

```ts
await db.users.findMany({
  where: {
    age: {
      gt: 18,
      lte: 65,
    },
  },
})
```

Available comparison operators:

```ts
{ age: { gt: 18 } }
{ age: { gte: 18 } }
{ age: { lt: 65 } }
{ age: { lte: 65 } }
```

### Inclusion

```ts
await db.users.findMany({
  where: {
    status: { in: ['active', 'pending'] },
  },
})
```

```ts
await db.users.findMany({
  where: {
    status: { notIn: ['banned', 'deleted'] },
  },
})
```

### Array filters

```ts
await db.posts.findMany({
  where: {
    tags: { arrayContains: 'featured' },
  },
})
```

```ts
await db.posts.findMany({
  where: {
    tags: { arrayContainsAny: ['new', 'sale'] },
  },
})
```

### Logical operators

```ts
await db.users.findMany({
  where: {
    OR: [{ role: 'admin' }, { role: 'owner' }],
  },
})
```

```ts
await db.users.findMany({
  where: {
    AND: [{ age: { gte: 18 } }, { verified: true }],
  },
})
```

```ts
await db.users.findMany({
  where: {
    NOT: { status: 'deleted' },
  },
})
```

---

## Select & Omit

Use `select` to return only specific fields.

```ts
const users = await db.users.findMany({
  select: {
    id: true,
    name: true,
  },
})

// TypeScript infers:
// Array<{ id: string; name: string }>
```

Use `omit` to remove fields from the result.

```ts
const user = await db.users.findUnique({
  where: { id: 'user_123' },
  omit: {
    passwordHash: true,
  },
})

// TypeScript infers:
// Omit<User, 'passwordHash'> | null
```

This is useful for removing sensitive fields before returning data from APIs.

---

## Pagination

### Offset pagination

```ts
const users = await db.users.findMany({
  take: 10,
  skip: 20,
})
```

### Cursor pagination

Use cursor-based pagination for stable, scalable pagination flows.

```ts
const page1 = await db.users.findMany({
  take: 10,
  orderBy: { createdAt: 'asc' },
})

const lastUser = page1.at(-1)

const page2 = await db.users.findMany({
  take: 10,
  cursor: { id: lastUser!.id },
  orderBy: { createdAt: 'asc' },
})
```

> Cursor pagination should use `orderBy` to keep results deterministic.

---

## Aggregations

Aggregations use Firestore's native `AggregateQuery`, so only the result is returned instead of transferring documents.

```ts
const stats = await db.orders.aggregate({
  where: { status: 'paid' },
  _count: true,
  _sum: { amount: true },
  _avg: { score: true },
})

console.log(stats._count)
console.log(stats._sum.amount)
console.log(stats._avg.score)
```

TypeScript understands the shape of the aggregation result based on the requested fields.

---

## Transactions

Use `$transaction` when you need atomic reads and writes.

Firestore requires all reads to happen before writes inside a transaction. The ODM keeps your repositories typed inside the transaction context.

```ts
await db.$transaction(async (tx) => {
  const sender = await tx.users.findUniqueOrThrow({
    where: { id: senderId },
  })

  const receiver = await tx.users.findUniqueOrThrow({
    where: { id: receiverId },
  })

  if (sender.balance < amount) {
    throw new Error('Insufficient funds')
  }

  tx.users.update({
    where: { id: sender.id },
    data: { balance: sender.balance - amount },
  })

  tx.users.update({
    where: { id: receiver.id },
    data: { balance: receiver.balance + amount },
  })
})
```

Use transactions when:

- You need to read data before writing
- Multiple writes depend on the current state of documents
- You need Firestore to retry the operation on contention

---

## Batch Writes

Use `$batch` for write-only atomic operations.

Unlike transactions, batch writes do not allow reads. They are useful when all write data is already known and you want to commit multiple operations atomically.

```ts
await db.$batch(({ users, posts }) => {
  users.create({
    data: {
      name: 'Alice',
      email: 'alice@example.com',
    },
  })

  users.update({
    where: { id: 'user_123' },
    data: { role: 'admin' },
  })

  posts.delete({
    where: { id: 'post_draft' },
  })
})
```

Use batch writes when:

- You only need writes
- You do not need to read documents first
- You want a faster alternative to transactions for atomic write operations

---

## Field Defaults

Default values can be defined in each repository. They are automatically merged into every `create` and `createMany` call.

Provided data takes precedence over default values.

```ts
interface Post {
  id: string
  title: string
  authorId: string
  status: 'draft' | 'published'
  views: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

type CreatePost = Omit<Post, 'id' | 'createdAt' | 'updatedAt'>

class PostsRepository extends BaseRepository<Post, CreatePost> {
  constructor() {
    super('posts', null, {
      status: 'draft' as const,
      views: 0,
    })
  }
}
```

```ts
await db.posts.create({
  data: {
    title: 'Hello World',
    authorId: 'user_123',
  },
})

// status and views are set automatically
```

---

## Extending Repositories

You can add domain-specific methods directly to your repository classes.

```ts
export class UsersRepository extends BaseRepository<User, CreateUser> {
  constructor() {
    super('users', null, { role: 'member' as const })
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findFirst({ where: { email } })
  }

  countAdmins(): Promise<number> {
    return this.count({ where: { role: 'admin' } })
  }
}
```

This keeps reusable business queries close to the data model while still exposing the base ODM methods.

---

## Emulator Support

Use the `emulator` option to connect the ODM client to the Firestore emulator during local development.

Pass `true` to use the default emulator address: `localhost:8080`.

```ts
export const db = createOdmClient(repositories, {
  serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT!,
  emulator: true,
})
```

You can also provide a custom emulator host and port.

```ts
export const db = createOdmClient(repositories, {
  serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT!,
  emulator: {
    host: 'localhost',
    port: 8080,
  },
})
```

---

## Error Handling

```ts
import { NotFoundError, OdmError } from '@vorisc/firestore-odm'

try {
  await db.users.findUniqueOrThrow({
    where: { id: 'missing_user' },
  })
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log(error.code) // NOT_FOUND
    console.log('User not found')
  }

  if (error instanceof OdmError) {
    console.log(error.code)
  }
}
```

---

## Recommended Project Structure

A simple structure for medium and large projects:

```txt
src/
  db.ts
  repositories/
    users.repository.ts
    orders.repository.ts
    posts.repository.ts
  modules/
    users/
      create-user.ts
      fetch-users.ts
    orders/
      create-order.ts
```

The ODM client can be initialized once and shared across your application services, use cases, or route handlers.

---

## Contributing

Contributions are welcome.

If you want to contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add or update tests when necessary
5. Open a pull request with a clear description

For larger changes, consider opening an issue first to discuss the proposal.

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

## Credits

Firestore ODM is inspired by Prisma's developer experience, adapted for Firestore's document-based model.

