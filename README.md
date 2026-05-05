# Firestore ODM 🔥

> ODM (Object-Document Mapping) for Firestore, inspired by [Prisma](https://www.prisma.io)'s developer experience.

[![NPM version](https://img.shields.io/npm/v/@vorisc/firestore-odm?style=flat)](https://www.npmjs.com/package/firestore-odm)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org)
[![License](https://img.shields.io/npm/l/@vorisc/firestore-odm?style=flat)](./LICENSE)

If you love Prisma's API but need Firestore as your database, this is for you. `@vorisc/firestore-odm` gives you a familiar, fluent query interface with full TypeScript inference — return types narrow automatically based on `select` and `omit`.

```ts
const user = await db.users.findUniqueOrThrow({ 
  where: { id: 'x0sDDPL3viYqoZKPsuu1' } 
})

const orders = await db.orders.findMany({
  where: { status: 'pending', total: { gt: 100 } },
  orderBy: { createdAt: 'desc' },
  take: 20,
})

await db.$transaction(async (tx) => {
  const sender = await tx.users.findUniqueOrThrow({ 
    where: { id: senderId } 
  })
  
  tx.users.update({ 
    where: { 
      id: senderId 
    }, 
    data: { 
      balance: sender.balance - amount 
    } 
  })
})
```

---

## Features

- **Prisma-like API** — `findMany`, `findUnique`, `create`, `update`, `upsert`, `delete`, and more
- **Full TypeScript inference** — return types narrow automatically based on `select` and `omit`
- **Expressive `where` clauses** — `gt`, `lt`, `in`, `notIn`, `arrayContains`, `OR`, `AND`, `NOT`
- **Prisma-style pagination** — `take`, `skip`, `cursor: { id }`
- **Bulk operations** — `createMany`, `updateMany`, `deleteMany` with automatic 500-doc batching
- **Aggregations** — native `_count`, `_sum`, `_avg` via Firestore AggregateQuery
- **Transactions** — `$transaction` with typed context per repository
- **Atomic batch writes** — `$batch` for write-only atomic operations, faster than transactions
- **Auto timestamps** — `createdAt` and `updatedAt` managed automatically
- **Field defaults** — per-repository default values merged into every create
- **Emulator support** — connect to the Firestore emulator for local development

---

## Installation

```bash
npm install @vorisc/firestore-odm firebase-admin
# or
pnpm add @vorisc/firestore-odm firebase-admin
```

> Requires Node.js ≥ 22

---

## Quick Start

### 1. Define your model

```ts
// repos/users.repo.ts
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
    const db = '(default)'
    const defaults = { role: 'member' }
    super('users', db, defaults)
  }
}
```

### 2. Create the client

```ts
// db.ts
import { createOdmClient } from '@vorisc/firestore-odm'
import { UsersRepository } from './repos/users.repo'
import { OrdersRepository } from './repos/orders.repo'

const repos = {
  users: new UsersRepository(),
  orders: new OrdersRepository(),
}

const credentials = {
  // JSON string of the service account (e.g. the contents of serviceAccount.json)
  serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT!
}

export const db = createOdmClient(repos, credentials)
```

### 3. Query

```ts
import { db } from './db'

// Direct doc fetch — throws NotFoundError if not found
const user = await db.users.findUniqueOrThrow({ 
  where: { id: 'x0sDDPL3viYqoZKPsuu1' } 
})

// Field-operator filter + pagination
const admins = await db.users.findMany({
  where: { role: 'admin' },
  orderBy: { createdAt: 'desc' },
  take: 10,
})
```

---

## API Reference

### Find

```ts
// Returns null if not found
repo.findUnique({ where: { id } | WhereClause, select?, omit? })
repo.findFirst({ where?, orderBy?, take?, select?, omit? })
repo.findMany({ where?, orderBy?, take?, skip?, cursor?, select?, omit? })

// Throws NotFoundError if not found
repo.findUniqueOrThrow({ where })
repo.findFirstOrThrow({ where })
```

### Write

```ts
repo.create({ data })                      // auto-generates id unless data.id is set
repo.createMany({ data: [...] })           // → { count }
repo.update({ where, data })               // throws NotFoundError if no match
repo.updateMany({ where, data })           // → { count }
repo.upsert({ where, create, update })
repo.delete({ where: { id } })
repo.deleteMany({ where? })               // omit where to delete the entire collection → { count }
repo.count({ where? })
```

### Aggregation

Uses Firestore's native aggregation — no data is transferred, only the result.

```ts
const stats = await repo.aggregate({
  where: { status: 'active' },
  _count: true,
  _sum: { amount: true },
  _avg: { score: true },
})
// TypeScript knows: stats._count, stats._sum.amount, stats._avg.score
```

---

## Where Operators

```ts
// Direct value is shorthand for equals
{ status: 'active' }                           // status == 'active'

// Comparison
{ age: { gt: 18, lte: 65 } }

// Inclusion
{ status: { in: ['active', 'pending'] } }
{ status: { notIn: ['banned'] } }

// Array fields
{ tags: { arrayContains: 'featured' } }
{ tags: { arrayContainsAny: ['new', 'sale'] } }

// Logical combinators
{ OR: [{ role: 'admin' }, { role: 'owner' }] }
{ AND: [{ age: { gte: 18 } }, { verified: true }] }
{ NOT: { status: 'deleted' } }
```

---

## Select & Omit

Return types narrow automatically — no casting needed.

```ts
// select: only specified fields are returned
const partial = await repo.findMany({
  select: { id: true, name: true },
})
// type: Array<{ id: string; name: string }>

// omit: strip sensitive fields before returning
const safe = await repo.findUnique({
  where: { id: 'x0sDDPL3viYqoZKPsuu1' },
  omit: { passwordHash: true },
})
// type: Omit<User, 'passwordHash'>
```

---

## Pagination

```ts
// Offset
await repo.findMany({ take: 10, skip: 20 })

// Cursor-based (requires orderBy for deterministic results)
const page1 = await repo.findMany({
  take: 10,
  orderBy: { 
    createdAt: 'asc'
  },
})

const page2 = await repo.findMany({
  take: 10,
  cursor: { 
    id: page1.at(-1)!.id 
  },
  orderBy: { 
    createdAt: 'asc' 
  },
})
```

---

## Transactions

Use `$transaction` when you need reads and writes to be atomic.
All reads must happen before writes (Firestore requirement).
The transaction retries automatically on contention.

```ts
await db.$transaction(async (tx) => {
  const sender = await tx.users.findUniqueOrThrow({ 
    where: { id: senderId } 
  })

  if (sender.balance < amount) {
    throw new Error('Insufficient funds')
  }

  tx.users.update({ 
    where: { 
      id: senderId 
    }, 
    data: { 
      balance: sender.balance - amount 
    } 
  })
})
```

---

## Batch Writes

Use `$batch` for write-only atomic operations. No reads allowed — all writes
are enqueued synchronously and committed in a single Firestore `WriteBatch`.
Faster than `$transaction` when you don't need to read before writing.

```ts
await db.$batch(({ users, posts }) => {
  users.create({ data: { name: 'Alice', email: 'alice@example.com' } })
  users.update({ where: { id: 'u_old' }, data: { role: 'admin' } })
  posts.delete({ where: { id: 'p_draft' } })
})
```

---

## Field Defaults

Pass default values to the `BaseRepository` constructor. They are merged into
every `create` and `createMany` call, with the provided data taking precedence.

```ts
class PostsRepository extends BaseRepository<Post, CreatePost> {
  constructor() {
    const db = '(default)'
    const defaults = { status: 'draft', views: 0 }
    super('posts', db, defaults)
  }
}

// status and views are set automatically
await repo.create({ 
  data: { 
    title: 'Hello World', 
    authorId: 'x0sDDPL3viYqoZKPsuu1' 
  } 
})
```

---

## Extending Repositories

Add domain-specific methods directly on your repository class:

```ts
export class UsersRepository extends BaseRepository<User, CreateUser> {
  constructor() {
    const db = '(default)'
    const defaults = { role: 'member' }
    super('users', db, defaults)
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findFirst({ where: { email } })
  }

  countAdmins(): Promise<number> {
    return this.count({ where: { role: 'admin' } })
  }
}
```

---

## Emulator

```ts
const db = createOdmClient(repos, {
  serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT!, // JSON string
  emulator: true,                   
  // emulator: { host: 'localhost', port: 9090 }  // custom host/port
})
```

---

## Error Handling

```ts
import { NotFoundError, OdmError } from '@vorisc/firestore-odm'

try {
  await db.users.findUniqueOrThrow({ where: { id: 'missing' } })
} catch (err) {
  if (err instanceof NotFoundError) {
    // err.code === 'NOT_FOUND'
    console.log('User not found')
  }
}
```

---

## License

MIT
