# FundSpark – Server

Express 5 REST API backend for the FundSpark crowdfunding platform.

## Tech Stack

- **Runtime:** Node.js (CommonJS)
- **Framework:** Express 5
- **Database:** MongoDB Driver 7
- **Auth:** jose-cjs (JWT verification for API routes)
- **Payments:** Stripe
- **Deployment:** Vercel (via vercel.json)

## Features

- 30+ REST API endpoints
- JWT-based authentication with role middleware (`verifyJWT`, `verifySupporter`, `verifyCreator`, `verifyAdmin`)
- Campaign CRUD with pending/approved/rejected/suspended status
- Contribution system with credit deduction, approval, and refund
- Stripe checkout session creation and payment success handling
- Withdrawal requests with multi-method support (Stripe, Bkash, Nagad, Rocket)
- Notification system with read/unread tracking
- Admin management (users, campaigns, reports, withdrawals)
- Creator campaign deletion with automatic supporter refunds

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB instance (Atlas or local)
- Stripe account

### Environment Variables

Copy `.env` to the project root (already configured for local dev):

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 5000) |
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name |
| `DB_USERS` | Users collection name |
| `DB_CAMPAIGNS` | Campaigns collection name |
| `DB_CONTRIBUTIONS` | Contributions collection name |
| `DB_WITHDRAWALS` | Withdrawals collection name |
| `DB_PAYMENTS` | Payments collection name |
| `DB_NOTIFICATIONS` | Notifications collection name |
| `DB_REPORTS` | Reports collection name |
| `BETTER_AUTH_SECRET` | Must match client's secret for JWT verification |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (passed to client) |

### Install & Run

```bash
npm install
node index.js          # http://localhost:5000
```

No auto-reload — restart manually after edits.

## API Endpoints

### Campaigns
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/campaigns/create` | Creator | Create campaign (pending status) |
| GET | `/api/campaigns` | Public | List approved campaigns |
| GET | `/api/campaigns/:id` | Public | Get campaign by ID |
| GET | `/api/campaigns/top` | Public | Top 6 by raised amount |
| GET | `/api/campaigns/my` | Creator | Creator's own campaigns |
| PUT | `/api/campaigns/update/:id` | Creator | Update campaign |
| DELETE | `/api/campaigns/delete/:id` | Creator | Delete campaign + refund supporters |

### Admin Campaigns
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/campaigns/pending` | Admin | Pending campaigns |
| GET | `/api/admin/campaigns/all` | Admin | All campaigns |
| PUT | `/api/admin/campaigns/approve` | Admin | Approve campaign |
| PUT | `/api/admin/campaigns/reject` | Admin | Reject campaign |
| PUT | `/api/admin/campaigns/suspend` | Admin | Suspend campaign |
| DELETE | `/api/admin/campaigns/delete` | Admin | Delete campaign + refund |

### Contributions
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/campaigns/contribute` | Supporter | Submit contribution |
| GET | `/api/contributions/pending` | Creator | Pending contributions |
| GET | `/api/contributions/my` | User | Supporter's contributions (paginated) |
| GET | `/api/contributions/approved` | User | Approved contributions |
| PUT | `/api/contributions/status` | Creator | Approve/reject contribution |

### Payments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/payments/create-checkout` | User | Stripe checkout session |
| GET | `/api/payments/success` | Public | Payment success handler |
| GET | `/api/payments/history` | User | Payment/withdrawal history |

### Withdrawals
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/withdrawals/create` | Creator | Request withdrawal |
| GET | `/api/withdrawals/my` | Creator | Creator's withdrawals |
| GET | `/api/admin/withdrawals/pending` | Admin | Pending withdrawals |
| GET | `/api/admin/withdrawals/all` | Admin | All withdrawals |
| PUT | `/api/admin/withdrawals/approve` | Admin | Approve withdrawal |
| PUT | `/api/admin/withdrawals/reject` | Admin | Reject withdrawal |

### Users & Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/user/profile` | User | Current user profile |
| GET | `/api/user/public/:email` | Public | Public user info (name, image) |
| GET | `/api/admin/users` | Admin | All users |
| PUT | `/api/admin/users/role` | Admin | Change user role |
| DELETE | `/api/admin/users/remove` | Admin | Remove user |

### Stats
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/stats` | Public | Platform stats |
| GET | `/api/creator/stats` | Creator | Creator dashboard stats |
| GET | `/api/supporter/stats` | Supporter | Supporter dashboard stats |
| GET | `/api/admin/stats` | Admin | Admin dashboard stats |

### Notifications & Reports
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | User | User notifications |
| PUT | `/api/notifications/:id/read` | User | Mark notification read |
| PUT | `/api/notifications/read-all` | User | Mark all read |
| POST | `/api/reports/create` | User | Submit report |
| GET | `/api/admin/reports` | Admin | All reports |
| DELETE | `/api/admin/reports/remove/:id` | Admin | Dismiss report |

## Project Structure

```
├── index.js          # All routes and server logic
├── .env              # Environment variables
├── package.json
└── vercel.json       # Vercel deployment config
```

## Deployment

Deploy to Vercel:

```bash
vercel --prod
```

Set all environment variables in the Vercel project dashboard. The `vercel.json` configures the Express server to run as a serverless function.
