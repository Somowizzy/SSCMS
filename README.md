# SSCMS - Smart Supply Chain Management System

A comprehensive web-based supply chain management system designed for preform and cap manufacturing companies. Built with Node.js, Express, and SQLite (sql.js).

![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)
![Express](https://img.shields.io/badge/Express-4.x-blue?logo=express)
![SQLite](https://img.shields.io/badge/SQLite-sql.js-blue?logo=sqlite)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Dashboard** — Real-time overview with AI-driven demand forecasts and smart reorder suggestions
- **Inventory Management** — Track raw materials, packaging, and consumables with low-stock alerts
- **Production Operations** — Schedule, track, and manage manufacturing jobs with progress monitoring
- **Finished Goods Warehouse** — Quality control (QC) inspections and shipping readiness tracking
- **Shipping Logistics** — Create shipping manifests, track shipments, and manage deliveries
- **Inter-Department Requests** — Role-based request/approval workflow between departments
- **User & Role Management** — Role-based access control (Admin, Dept Head, Dept User)
- **Notifications** — Real-time in-app notifications for approvals, stock alerts, and more
- **Audit Logging** — Full activity trail for compliance and accountability

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Database | SQLite via sql.js (pure JavaScript, no native dependencies) |
| Frontend | Vanilla HTML/CSS/JavaScript (SPA) |
| Auth | JWT (JSON Web Tokens) + bcrypt |
| AI Service | Built-in demand forecasting engine |

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/sscms.git
cd sscms

# Install dependencies
npm install

# Start the server
npm start
```

The app will be running at **http://localhost:3000**

### Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@sscms.com | admin123 |

## Project Structure

```
├── server.js                 # Express server entry point
├── package.json
├── public/                   # Frontend (SPA)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js            # Main app logic, routing, auth
│       ├── api.js            # API client
│       └── components/       # Page components
│           ├── dashboard.js
│           ├── inventory.js
│           ├── production.js
│           ├── finishedGoods.js
│           ├── shipping.js
│           ├── requests.js
│           ├── users.js
│           ├── sidebar.js
│           └── login.js
├── src/
│   ├── db/
│   │   ├── database.js       # sql.js database wrapper
│   │   └── seed.js           # Sample data seeder
│   ├── middleware/
│   │   └── auth.js           # JWT auth + audit logging
│   ├── routes/               # API endpoints
│   │   ├── auth.js
│   │   ├── inventory.js
│   │   ├── production.js
│   │   ├── finishedGoods.js
│   │   ├── shipping.js
│   │   ├── requests.js
│   │   ├── users.js
│   │   ├── reports.js
│   │   ├── notifications.js
│   │   ├── departments.js
│   │   └── audit.js
│   └── services/
│       └── ai.js             # AI demand forecasting
└── data/                     # SQLite database (auto-created)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/inventory` | List inventory items |
| POST | `/api/inventory` | Add inventory item |
| GET | `/api/production` | List production jobs |
| POST | `/api/production` | Schedule production job |
| GET | `/api/finished-goods` | List finished goods |
| GET | `/api/shipping` | List shipments |
| POST | `/api/shipping` | Create shipping manifest |
| GET | `/api/requests` | List requests |
| POST | `/api/requests` | Submit request |
| GET | `/api/reports/dashboard` | Dashboard data + AI insights |
| GET | `/api/users` | List users |
| GET | `/api/notifications` | User notifications |

## Deployment

This app is deployed on [Render](https://render.com) with automatic deploys from GitHub.

## License

MIT License - feel free to use for educational purposes.
