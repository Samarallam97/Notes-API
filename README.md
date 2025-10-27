`developed with (https://claude.ai/) help ♡`

## 0.Tech  Stack : Express.js  , SQL Server

## 1. Project Structure

```
notes-api/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   ├── redis.js
│   │   ├── multer.js
│   │   
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── reportsController.js
│   │   ├── notesController.js
│   │   ├── categoriesController.js
│   │   ├── sharingController.js
│	│   ├── templatesController.js
│   │   └── exportController.js
│   │   
│   │       
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── validate.js
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   ├── cache.js
│   │   ├── auditLog.js
│   │   └── softDelete.js
│   │
│	│
│	├── routes/
│   │   ├── index.js
│   │   ├── reportsRoutes.js
│   │   ├── authRoutes.js
│   │   ├── notesRoutes.js
│   │   ├── categoriesRoutes.js
│   │   ├── sharingRoutes.js
│   │   ├── templatesRoutes.js
│   │   └── exportRoutes.js
│   │  
│   │       
│   ├── utils/
│   │   ├── apiFeatures.js
│   │   ├── fileUpload.js
│   │   └── pdfGenerator.js
│   │
│	│
│	├── jobs/
│   │   ├── emailNotification.js
│	│	├── reportGenerator.js
│   │   └── reportGenerator.js
│	│	
│   │
│	│
│	├── sockets/
│   │   └── noteSocket.js
│   └── server.js
│
├── uploads/                    
├── .env
├── .env.example
├── .gitignore
├── package.json
└── package-lock.json
```

---

## 2. Database Setup

##### SQL Server Schema


```sql
-- Create Database
CREATE DATABASE NotesAppDB;
GO

USE master;
GO

-- Users Table
CREATE TABLE Users (
    id INT PRIMARY KEY IDENTITY(1,1),
    username NVARCHAR(50) UNIQUE NOT NULL,
    email NVARCHAR(100) UNIQUE NOT NULL,
    password NVARCHAR(255) NOT NULL,
    role NVARCHAR(20) DEFAULT 'user', -- user, admin
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- Categories Table
CREATE TABLE Categories (
    id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NOT NULL,
    name NVARCHAR(50) NOT NULL,
    color NVARCHAR(7) DEFAULT '#3B82F6',
    created_at DATETIME DEFAULT GETDATE(),
    deleted_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    CONSTRAINT UQ_User_Category UNIQUE(user_id, name)
);

-- Notes Table (with soft delete)
CREATE TABLE Notes (
    id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NOT NULL,
    category_id INT NULL,
    title NVARCHAR(200) NOT NULL,
    content NVARCHAR(MAX),
    is_pinned BIT DEFAULT 0,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    deleted_at DATETIME NULL,
    deleted_by INT NULL,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE NO ACTION,
    FOREIGN KEY (category_id) REFERENCES Categories(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES Users(id)
);

-- Tags Table
CREATE TABLE Tags (
    id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NOT NULL,
    name NVARCHAR(30) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    CONSTRAINT UQ_User_Tag UNIQUE(user_id, name)
);

-- Note_Tags Junction Table
CREATE TABLE Note_Tags (
    note_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES Notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES Tags(id) ON DELETE CASCADE
);

-- File Attachments Table
CREATE TABLE Attachments (
    id INT PRIMARY KEY IDENTITY(1,1),
    note_id INT NOT NULL,
    filename NVARCHAR(255) NOT NULL,
    original_name NVARCHAR(255) NOT NULL,
    mime_type NVARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    file_path NVARCHAR(500) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (note_id) REFERENCES Notes(id) ON DELETE CASCADE
);

-- Note Sharing Table (RBAC)
CREATE TABLE Shared_Notes (
    id INT PRIMARY KEY IDENTITY(1,1),
    note_id INT NOT NULL,
    shared_by INT NOT NULL,
    shared_with INT NOT NULL,
    permission NVARCHAR(20) DEFAULT 'read', -- read, edit
    created_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (note_id) REFERENCES Notes(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by) REFERENCES Users(id),
    FOREIGN KEY (shared_with) REFERENCES Users(id),
    CONSTRAINT UQ_Share UNIQUE(note_id, shared_with)
);

-- Audit Log Table
CREATE TABLE Audit_Logs (
    id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NOT NULL,
    action NVARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, SHARE, etc.
    entity_type NVARCHAR(50) NOT NULL, -- Note, Category, etc.
    entity_id INT NOT NULL,
    old_values NVARCHAR(MAX), -- JSON
    new_values NVARCHAR(MAX), -- JSON
    ip_address NVARCHAR(50),
    user_agent NVARCHAR(500),
    created_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES Users(id)
);

-- Note Templates Table
CREATE TABLE Note_Templates (
    id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NULL, -- NULL for system templates
    name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500),
    title_template NVARCHAR(200),
    content_template NVARCHAR(MAX),
    is_public BIT DEFAULT 0,
    usage_count INT DEFAULT 0,
    created_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL
);

-- Indexes for Performance
CREATE INDEX idx_notes_user_id ON Notes(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_deleted ON Notes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_notes_category_id ON Notes(category_id);
CREATE INDEX idx_notes_created_at ON Notes(created_at DESC);
CREATE INDEX idx_shared_notes_user ON Shared_Notes(shared_with);
CREATE INDEX idx_audit_logs_user ON Audit_Logs(user_id, created_at DESC);
CREATE INDEX idx_attachments_note ON Attachments(note_id);

-- Full-text Search
CREATE FULLTEXT CATALOG NotesFullTextCatalog AS DEFAULT;
CREATE FULLTEXT INDEX ON Notes(title, content)
KEY INDEX PK__Notes__3213E83F ON NotesFullTextCatalog;
```

---
## 3. Used Packages:

###### Core Web Server

- ==**`express`**==:It's a minimal and flexible Node.js web application framework that provides a robust set of features for building web and mobile applications, specifically APIs.
---

###### Configuration & Middleware

- ==**`dotenv`**==: A zero-dependency module that loads environment variables (like database passwords, API keys, or port numbers) from a `.env` file into `process.env`. This keeps  sensitive configuration data separate from  code.

- ==**`cors`**==:(Cross-Origin Resource Sharing) This is an Express middleware that allows your API, running on one domain, to receive requests from a front-end application running on a different domain (e.g., allowing `react-app.com` to fetch data from `api.my-server.com`).

---

###### Security & Authentication

- ==**`bcryptjs`**==: Used for **hashing passwords**. 
    
- ==**`jsonwebtoken`**== (JWT): Used for **authentication**. After a user logs in successfully, you create a signed JSON Web Token (JWT) and send it to them. They must include this token in the header of future requests to prove who they are and access protected routes.

---

###### Database & Caching

- ==**`mssql`**==: The Microsoft SQL Server driver for Node.js. This package allows your application to connect to, query, and perform operations on a Microsoft SQL Server database.

- ==**`ioredis`**==: high-performance client for connecting to a **Redis** in-memory data store.


---
###### API Rate Limiting

- ==**`express-rate-limit`**==: A middleware used to limit repeated requests to your API from the same IP address. This is a crucial security measure to prevent abuse and (Denial of Service) DDoS attacks.
    
- ==**`rate-limit-redis`**==: A "store" for `express-rate-limit`. By default, `express-rate-limit` stores request counts in memory. This package allows it to use **Redis** instead, so you can share the rate limit counters across multiple servers or processes.

---

###### Real-time Communication

- ==**`socket.io`**==: Enables real-time, bidirectional (two-way) communication between your server and clients (like web browsers). It's the standard for building chat applications, live notifications, real-time dashboards, or multiplayer games.


---

###### File Handling (Uploads, Generation & Parsing)

- ==**`multer`**==: A middleware for handling `multipart/form-data`, which is primarily used for **uploading files**. When a user submits a form with a file (like an image or a document), `multer` makes it easy to access that file on your server.
    
- ==**`pdfkit`**==: A PDF generation library. It provides a simple API to create and stream complex PDF documents from scratch on your server.
    
- ==**`csv-parser`**==: A streaming CSV (Comma Separated Values) parser. It's used for reading large CSV files efficiently, line by line, and converting them into JavaScript objects.
    
- ==**`csv-writer`**==: The opposite of `csv-parser`. It takes an array of JavaScript objects and converts them into a CSV string or file.
    
- ==**`papaparse`**==: Another powerful CSV parser that works in both Node.js and the browser. It's known for its speed, ease of use, and ability to handle very large files and malformed CSVs.

---

###### Background Jobs & Email

- ==**`bull`**==: A robust job queue system built on top of Redis. It allows you to run **background jobs** (also called "workers"). You use this for long-running tasks that shouldn't block your API, such as processing a large file, sending thousands of emails, or generating a report.
    
- ==**`nodemailer`**==: The standard library for **sending emails** from your Node.js application. It's used for sending welcome emails, password resets, notifications, and more.

---

###### Development Tools

- **`nodemon`**: A utility that **automatically restarts your server** whenever it detects file changes in your project directory. This is an essential tool for development, as it saves you from manually stopping and starting your server every time you make a code change. It is installed as a `devDependency` because it's not needed in production.

---
## 4. **Complete Features List**


| Feature             | Implementation   | Files                                |
| ------------------- | ---------------- | ------------------------------------ |
| **Authentication**  | JWT, bcrypt      | authController.js, auth.js           |
| **CRUD Operations** | Full REST API    | notesController.js, routes           |
| **File Management** | Upload/Download  | fileUpload.js, multer.js             |
| **Sharing System**  | RBAC permissions | sharingController.js                 |
| **Real-time**       | WebSocket        | noteSocket.js, Socket.IO             |
| **Caching**         | Redis layer      | cache.js, redis.js                   |
| **Rate Limiting**   | IP throttling    | rateLimiter.js                       |
| **Audit Logs**      | Action tracking  | auditLog.js                          |
| **Soft Delete**     | Data recovery    | softDelete.js                        |
| **Export/Import**   | PDF, CSV, JSON   | exportController.js, pdfGenerator.js |
| **Templates**       | Reusable notes   | templatesController.js               |
| **Reports**         | Automated emails | reportGenerator.js                   |
| **Scheduled Jobs**  | Cron tasks       | scheduler.js                         |
| **Validation**      | Joi schemas      | validate.js                          |

---

---
## 5. All Endpoints Summary


|Method|Endpoint|Description|Auth|
|---|---|---|---|
|POST|`/api/v1/auth/register`|Register user|No|
|POST|`/api/v1/auth/login`|Login user|No|
|GET|`/api/v1/auth/me`|Get profile|Yes|
|GET|`/api/v1/notes`|List notes|Yes|
|POST|`/api/v1/notes`|Create note|Yes|
|GET|`/api/v1/notes/:id`|Get note|Yes|
|PUT|`/api/v1/notes/:id`|Update note|Yes|
|DELETE|`/api/v1/notes/:id`|Delete note|Yes|
|GET|`/api/v1/notes/trash`|View trash|Yes|
|POST|`/api/v1/notes/:id/restore`|Restore note|Yes|
|DELETE|`/api/v1/notes/:id/permanent`|Permanent delete|Yes|
|GET|`/api/v1/notes/stats`|Get statistics|Yes|
|GET|`/api/v1/notes/tags`|List tags|Yes|
|GET|`/api/v1/notes/:id/attachments`|List attachments|Yes|
|GET|`/api/v1/notes/:id/attachments/:aid/download`|Download file|Yes|
|DELETE|`/api/v1/notes/:id/attachments/:aid`|Delete attachment|Yes|
|GET|`/api/v1/categories`|List categories|Yes|
|POST|`/api/v1/categories`|Create category|Yes|
|PUT|`/api/v1/categories/:id`|Update category|Yes|
|DELETE|`/api/v1/categories/:id`|Delete category|Yes|
|POST|`/api/v1/sharing/notes/:id/share`|Share note|Yes|
|GET|`/api/v1/sharing/notes/:id/users`|List shared users|Yes|
|GET|`/api/v1/sharing/shared-with-me`|Notes shared with me|Yes|
|DELETE|`/api/v1/sharing/:shareId`|Revoke share|Yes|
|GET|`/api/v1/templates`|List templates|Yes|
|POST|`/api/v1/templates`|Create template|Yes|
|POST|`/api/v1/templates/:id/use`|Use template|Yes|
|DELETE|`/api/v1/templates/:id`|Delete template|Yes|
|GET|`/api/v1/export/notes/:id/pdf`|Export note PDF|Yes|
|GET|`/api/v1/export/notes/pdf`|Export all PDF|Yes|
|GET|`/api/v1/export/notes/json`|Export JSON|Yes|
|GET|`/api/v1/export/notes/csv`|Export CSV|Yes|
|POST|`/api/v1/export/notes/import`|Import JSON|Yes|
|GET|`/health`|Health check|No|
|GET|`/`|API info|No|
|GET|`/api-docs`|Swagger docs|No|


## 6. Documentation

### ==1. Authentication Endpoints==

##### **1.1 Register New User**

**Endpoint:** `POST /api/v1/auth/register`  
**Authentication:** None (Public)  
**Rate Limit:** 5 requests per 15 minutes

**Request Body:**

```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Validation Rules:**

- `username`: 3-30 alphanumeric characters
- `email`: Valid email format
- `password`: Minimum 6 characters

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "role": "user",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**

```json
// 400 - Validation Error
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    }
  ]
}

// 400 - Duplicate User
{
  "success": false,
  "error": "Duplicate entry. This record already exists."
}
```

##### 1.2 Login User

**Endpoint:** `POST /api/v1/auth/login`  
**Authentication:** None (Public)  
**Rate Limit:** 5 requests per 15 minutes

**Request Body:**

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "role": "user",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response:**

```json
// 401 - Invalid Credentials
{
  "success": false,
  "error": "Invalid credentials"
}
```


**Important:** Save the `token` from the response. Use it in the `Authorization` header for all protected endpoints:

```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

###### 1.3 Get Current User Profile

**Endpoint:** `GET /api/v1/auth/me`  
**Authentication:** Required (Bearer Token)

**Headers:**

```
Authorization: Bearer YOUR_TOKEN
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "role": "user",
    "created_at": "2025-10-27T10:00:00.000Z"
  }
}
```


---


---

### ==2. Notes Endpoints==

###### 2.1. Get All Notes (with filters & pagination)

**Endpoint:** `GET /api/v1/notes`  
**Authentication:** Required  
**Cache:** 60 seconds

**Query Parameters:**

|Parameter|Type|Default|Description|
|---|---|---|---|
|`page`|number|1|Page number|
|`limit`|number|10|Items per page (max 100)|
|`search`|string|-|Search in title and content|
|`category_id`|number|-|Filter by category|
|`is_pinned`|boolean|-|Filter pinned notes|
|`date_from`|date|-|Filter from date (YYYY-MM-DD)|
|`date_to`|date|-|Filter to date (YYYY-MM-DD)|
|`sort`|string|updated_at|Sort field (title, created_at, updated_at)|
|`order`|string|desc|Sort order (asc, desc)|
|`include_deleted`|boolean|false|Include soft-deleted (admin only)|

**Example Requests:**

```bash
# Basic - Get first 10 notes
GET /api/v1/notes

# With pagination
GET /api/v1/notes?page=2&limit=20

# Search notes
GET /api/v1/notes?search=meeting

# Filter by category
GET /api/v1/notes?category_id=1

# Filter pinned notes only
GET /api/v1/notes?is_pinned=true

# Date range filter
GET /api/v1/notes?date_from=2025-01-01&date_to=2025-01-31

# Sort by title ascending
GET /api/v1/notes?sort=title&order=asc

# Combined filters
GET /api/v1/notes?search=project&category_id=2&is_pinned=true&page=1&limit=10&sort=updated_at&order=desc
```

**Success Response (200):**

```json
{
  "success": true,
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "totalCount": 47,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "data": [
    {
      "id": 1,
      "title": "Team Meeting Notes",
      "content": "Discussed Q4 goals and project timeline...",
      "is_pinned": true,
      "created_at": "2025-10-20T10:00:00.000Z",
      "updated_at": "2025-10-27T14:30:00.000Z",
      "deleted_at": null,
      "attachment_count": 2,
      "category": {
        "id": 1,
        "name": "Work",
        "color": "#3B82F6"
      },
      "tags": ["meeting", "q4", "planning"]
    }
  ]
}
```



###### 2.2 Get Single Note

**Endpoint:** `GET /api/v1/notes/:id`  
**Authentication:** Required  
**Permissions:** Owner or shared user

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "Project Planning",
    "content": "Detailed project requirements and timeline...",
    "is_pinned": false,
    "created_at": "2025-10-25T09:00:00.000Z",
    "updated_at": "2025-10-27T15:00:00.000Z",
    "category": {
      "id": 2,
      "name": "Projects",
      "color": "#10B981"
    },
    "tags": [
      {
        "id": 1,
        "name": "planning"
      },
      {
        "id": 3,
        "name": "important"
      }
    ]
  }
}
```

**Error Response:**

```json
// 404 - Note not found
{
  "success": false,
  "error": "Note not found"
}

// 403 - No permission
{
  "success": false,
  "error": "You do not have permission to access this note"
}
```


###### 2.3 Create Note (with attachments)

**Endpoint:** `POST /api/v1/notes`  
**Authentication:** Required  
**Content-Type:** `multipart/form-data` (for file uploads)

**Form Data Fields:**

```
title: "Meeting Notes" (required, max 200 chars)
content: "Discussion points..." (optional, max 10000 chars)
category_id: 1 (optional, must be valid category ID)
is_pinned: false (optional, boolean)
tags: ["meeting", "important"] (optional, array, max 10 tags)
attachments: [file1.pdf, file2.jpg] (optional, max 5 files, 5MB each)
```

**Allowed File Types:**

- Images: `image/jpeg`, `image/png`, `image/gif`
- Documents: `application/pdf`, `text/plain`

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 15,
    "user_id": 1,
    "category_id": 1,
    "title": "Meeting Notes",
    "content": "Discussion points...",
    "is_pinned": false,
    "created_at": "2025-10-27T16:00:00.000Z",
    "updated_at": "2025-10-27T16:00:00.000Z",
    "tags": ["meeting", "important"],
    "attachments": [
      {
        "fieldname": "attachments",
        "originalname": "report.pdf",
        "filename": "attachments-1730044800000-abc123.pdf",
        "mimetype": "application/pdf",
        "size": 245678
      }
    ]
  }
}
```

###### 2.4. Update Note

**Endpoint:** `PUT /api/v1/notes/:id`  
**Authentication:** Required  
**Permissions:** Owner or shared user with edit permission

**Request Body:**

```json
{
  "title": "Updated Meeting Notes",
  "content": "Updated discussion points...",
  "category_id": 2,
  "is_pinned": true,
  "tags": ["meeting", "updated", "q4"]
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "user_id": 1,
    "category_id": 2,
    "title": "Updated Meeting Notes",
    "content": "Updated discussion points...",
    "is_pinned": true,
    "created_at": "2025-10-20T10:00:00.000Z",
    "updated_at": "2025-10-27T16:30:00.000Z",
    "tags": ["meeting", "updated", "q4"]
  }
}
```



###### 2.5. Delete Note (Soft Delete - Move to Trash)

**Endpoint:** `DELETE /api/v1/notes/:id`  
**Authentication:** Required  
**Permissions:** Owner or shared user with edit permission

**Success Response (200):**

```json
{
  "success": true,
  "message": "Note moved to trash"
}
```

**Note:** The note is soft-deleted (moved to trash) and can be restored.


###### 2.6. Get Trash (Soft-Deleted Notes)

**Endpoint:** `GET /api/v1/notes/trash`  
**Authentication:** Required

**Success Response (200):**

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": 5,
      "title": "Old Meeting Notes",
      "deleted_at": "2025-10-26T12:00:00.000Z",
      "deleted_by_username": "john_doe"
    },
    {
      "id": 8,
      "title": "Draft Ideas",
      "deleted_at": "2025-10-25T09:30:00.000Z",
      "deleted_by_username": "john_doe"
    }
  ]
}
```


###### 2.7. Restore Note from Trash

**Endpoint:** `POST /api/v1/notes/:id/restore`  
**Authentication:** Required  
**Permissions:** Owner only

**Success Response (200):**

```json
{
  "success": true,
  "message": "Note restored successfully"
}
```


###### 2.8 Permanently Delete Note

**Endpoint:** `DELETE /api/v1/notes/:id/permanent`  
**Authentication:** Required  
**Permissions:** Owner only

**Warning:** This permanently deletes the note and all attachments. Cannot be undone!

**Success Response (200):**

```json
{
  "success": true,
  "message": "Note permanently deleted"
}
```


###### 2.9. Get Note Statistics

**Endpoint:** `GET /api/v1/notes/stats`  
**Authentication:** Required  
**Cache:** 5 minutes

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "total_notes": 47,
    "pinned_notes": 5,
    "trash_count": 3,
    "categories_used": 4,
    "total_categories": 6,
    "total_tags": 15,
    "total_attachments": 23,
    "shared_count": 8
  }
}
```


###### 2.10. Get All Tags

**Endpoint:** `GET /api/v1/notes/tags`  
**Authentication:** Required

**Success Response (200):**

```json
{
  "success": true,
  "count": 12,
  "data": [
    {
      "id": 1,
      "name": "important",
      "usage_count": 15
    },
    {
      "id": 2,
      "name": "meeting",
      "usage_count": 12
    },
    {
      "id": 3,
      "name": "work",
      "usage_count": 8
    }
  ]
}
```



###### 2.11. Get Note Attachments

**Endpoint:** `GET /api/v1/notes/:id/attachments`  
**Authentication:** Required  
**Permissions:** Owner or shared user

**Success Response (200):**

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": 1,
      "filename": "attachments-1730044800000-abc123.pdf",
      "original_name": "report.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 245678,
      "created_at": "2025-10-27T16:00:00.000Z"
    },
    {
      "id": 2,
      "filename": "attachments-1730044801000-def456.jpg",
      "original_name": "screenshot.jpg",
      "mime_type": "image/jpeg",
      "size_bytes": 123456,
      "created_at": "2025-10-27T16:00:00.000Z"
    }
  ]
}
```

**cURL Example:**

```bash
curl -X GET http://localhost:3000/api/v1/notes/1/attachments \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

###### 2.12. Download Attachment

**Endpoint:** `GET /api/v1/notes/:id/attachments/:attachmentId/download`  
**Authentication:** Required  
**Permissions:** Owner or shared user

**Response:** File download (binary)

**Browser:** Simply visit the URL with valid authentication to download


###### 2.13. Delete Attachment

**Endpoint:** `DELETE /api/v1/notes/:id/attachments/:attachmentId`  
**Authentication:** Required  
**Permissions:** Owner or shared user with edit permission

**Success Response (200):**

```json
{
  "success": true,
  "message": "Attachment deleted successfully"
}
```

---



---
## ==3. Categories Endpoints==

###### 3.1. Get All Categories

**Endpoint:** `GET /api/v1/categories`  
**Authentication:** Required

**Success Response (200):**

```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": 1,
      "name": "Work",
      "color": "#3B82F6",
      "created_at": "2025-10-20T10:00:00.000Z",
      "note_count": 15
    },
    {
      "id": 2,
      "name": "Personal",
      "color": "#10B981",
      "created_at": "2025-10-21T11:00:00.000Z",
      "note_count": 23
    }
  ]
}
```


###### 3.2. Create Category

**Endpoint:** `POST /api/v1/categories`  
**Authentication:** Required

**Request Body:**

```json
{
  "name": "Projects",
  "color": "#8B5CF6"
}
```

**Validation:**

- `name`: Required, 1-50 characters, unique per user
- `color`: Optional, valid hex color (e.g., #3B82F6), default: #3B82F6

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 6,
    "name": "Projects",
    "color": "#8B5CF6",
    "created_at": "2025-10-27T17:00:00.000Z"
  }
}
```


###### 3.3. Update Category

**Endpoint:** `PUT /api/v1/categories/:id`  
**Authentication:** Required

**Request Body:**

```json
{
  "name": "Work Projects",
  "color": "#6366F1"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Work Projects",
    "color": "#6366F1",
    "created_at": "2025-10-20T10:00:00.000Z"
  }
}
```

###### 3.4. Delete Category

**Endpoint:** `DELETE /api/v1/categories/:id`  
**Authentication:** Required

**Note:** Notes in this category will have `category_id` set to NULL

**Success Response (200):**

```json
{
  "success": true,
  "data": {}
}
```

---


---

## ==4. Sharing Endpoints==

###### 4.1. Share Note with User

**Endpoint:** `POST /api/v1/sharing/notes/:id/share`  
**Authentication:** Required  
**Permissions:** Owner only

**Request Body:**

```json
{
  "email": "colleague@example.com",
  "permission": "edit"
}
```

**Permissions:**

- `read`: Can view note only
- `edit`: Can view and edit note

**Success Response (201):**

```json
{
  "success": true,
  "message": "Note shared successfully",
  "data": {
    "sharedWith": {
      "id": 5,
      "username": "colleague_name",
      "email": "colleague@example.com"
    },
    "permission": "edit",
    "noteTitle": "Project Planning"
  }
}
```

**Note:** User receives email notification and real-time WebSocket notification


###### 4.2. Get Users Note is Shared With

**Endpoint:** `GET /api/v1/sharing/notes/:id/users`  
**Authentication:** Required  
**Permissions:** Owner only

**Success Response (200):**

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "shareId": 1,
      "user": {
        "id": 5,
        "username": "colleague_1",
        "email": "colleague1@example.com"
      },
      "permission": "edit",
      "sharedAt": "2025-10-25T10:00:00.000Z"
    },
    {
      "shareId": 2,
      "user": {
        "id": 7,
        "username": "colleague_2",
        "email": "colleague2@example.com"
      },
      "permission": "read",
      "sharedAt": "2025-10-26T14:30:00.000Z"
    }
  ]
}
```


###### 4.3. Get Notes Shared With Me

**Endpoint:** `GET /api/v1/sharing/shared-with-me`  
**Authentication:** Required

**Success Response (200):**

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": 15,
      "title": "Team Goals Q4",
      "content": "Our team objectives for the quarter...",
      "is_pinned": false,
      "created_at": "2025-10-20T09:00:00.000Z",
      "updated_at": "2025-10-27T11:00:00.000Z",
      "permission": "edit",
      "owner": {
        "id": 2,
        "username": "team_lead"
      },
      "category": {
        "id": 3,
        "name": "Team",
        "color": "#F59E0B"
      }
    }
  ]
}
```

###### 4.4. Revoke Share Access

**Endpoint:** `DELETE /api/v1/sharing/:shareId`  
**Authentication:** Required  
**Permissions:** Owner only

**Success Response (200):**

```json
{
  "success": true,
  "message": "Share access revoked successfully"
}
```

---

## ==5. Templates Endpoints==

###### 5.1. Get All Templates

**Endpoint:** `GET /api/v1/templates`  
**Authentication:** Required

**Response includes:**

- Your personal templates
- Public templates created by other users

**Success Response (200):**

```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": 1,
      "name": "Meeting Notes",
      "description": "Template for team meetings",
      "title_template": "Meeting - [Date]",
      "content_template": "Attendees:\n\nAgenda:\n1. \n2. \n\nAction Items:\n- \n\nNotes:\n",
      "is_public": true,
      "usage_count": 45,
      "created_at": "2025-10-15T10:00:00.000Z",
      "is_owner": 1
    },
    {
      "id": 2,
      "name": "Daily Journal",
      "description": "Daily reflection template",
      "title_template": "Journal - [Date]",
      "content_template": "Today I:\n\nGrateful for:\n\nTomorrow I will:\n",
      "is_public": false,
      "usage_count": 12,
      "created_at": "2025-10-18T14:00:00.000Z",
      "is_owner": 1
    }
  ]
}
```


###### 5.2. Create Template

**Endpoint:** `POST /api/v1/templates`  
**Authentication:** Required

**Request Body:**

```json
{
  "name": "Project Kickoff",
  "description": "Template for new project planning",
  "title_template": "Project: [Name]",
  "content_template": "## Project Overview\n\n## Goals\n\n## Timeline\n\n## Resources\n\n## Risks\n",
  "is_public": false
}
```

**Validation:**

- `name`: Required, 1-100 characters
- `description`: Optional, max 500 characters
- `title_template`: Optional, max 200 characters
- `content_template`: Optional, max 10000 characters
- `is_public`: Optional, boolean, default false

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 8,
    "user_id": 1,
    "name": "Project Kickoff",
    "description": "Template for new project planning",
    "title_template": "Project: [Name]",
    "content_template": "## Project Overview\n\n## Goals\n...",
    "is_public": false,
    "usage_count": 0,
    "created_at": "2025-10-27T18:00:00.000Z"
  }
}
```



###### 5.3. Use Template (Create Note from Template)

**Endpoint:** `POST /api/v1/templates/:templateId/use`  
**Authentication:** Required

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 25,
    "user_id": 1,
    "category_id": null,
    "title": "Meeting - [Date]",
    "content": "Attendees:\n\nAgenda:\n1. \n2. \n\nAction Items:\n- \n\nNotes:\n",
    "is_pinned": false,
    "created_at": "2025-10-27T18:30:00.000Z",
    "updated_at": "2025-10-27T18:30:00.000Z"
  }
}
```

**Note:** Template usage count is automatically incremented

###### 5.4. Delete Template

**Endpoint:** `DELETE /api/v1/templates/:templateId`  
**Authentication:** Required  
**Permissions:** Owner only

**Success Response (200):**

```json
{
  "success": true,
  "message": "Template deleted successfully"
}
```

---

## ==6. Export/Import Endpoints==

###### 6.1. Export Single Note as PDF

**Endpoint:** `GET /api/v1/export/notes/:id/pdf`  
**Authentication:** Required  
**Permissions:** Owner or shared user

**Response:** PDF file download

**PDF includes:**

- Note title
- Creation/update timestamps
- Category name
- Tags
- Content

**Browser:** Simply navigate to the URL (with valid auth) to download

###### 6.2. Export All Notes as PDF

**Endpoint:** `GET /api/v1/export/notes/pdf`  
**Authentication:** Required

**Response:** Combined PDF file with all notes

**PDF includes:**

- Cover page with user info and statistics
- All notes (one per page)
- Table of contents
- Export timestamp


##### 6.3. Export Notes as JSON

**Endpoint:** `GET /api/v1/export/notes/json`  
**Authentication:** Required

**Response:** JSON file download

**Success Response (200):**

```json
[
  {
    "id": 1,
    "title": "Meeting Notes",
    "content": "Discussion points...",
    "is_pinned": true,
    "created_at": "2025-10-20T10:00:00.000Z",
    "updated_at": "2025-10-27T14:30:00.000Z",
    "category": "Work",
    "tags": ["meeting", "q4"]
  },
  {
    "id": 2,
    "title": "Project Ideas",
    "content": "Innovation brainstorming...",
    "is_pinned": false,
    "created_at": "2025-10-22T11:00:00.000Z",
    "updated_at": "2025-10-25T09:00:00.000Z",
    "category": "Personal",
    "tags": ["ideas", "projects"]
  }
]
```

###### 6.4. Export Notes as CSV

**Endpoint:** `GET /api/v1/export/notes/csv`  
**Authentication:** Required

**Response:** CSV file download

**CSV Columns:**

- ID
- Title
- Content
- Category
- Pinned
- Created At
- Updated At



##### 6.5. Import Notes from JSON

**Endpoint:** `POST /api/v1/export/notes/import`  
**Authentication:** Required  
**Rate Limit:** 20 requests per hour

**Request Body:**

```json
{
  "notes": [
    {
      "title": "Imported Note 1",
      "content": "This is imported content",
      "is_pinned": false
    },
    {
      "title": "Imported Note 2",
      "content": "Another imported note",
      "is_pinned": true
    }
  ]
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Successfully imported 2 notes",
  "imported": 2,
  "errors": []
}
```

**Partial Success Response (200):**

```json
{
  "success": true,
  "message": "Successfully imported 8 notes",
  "imported": 8,
  "errors": [
    "Failed to import note: Missing Title",
    "Failed to import note: Invalid Data"
  ]
}
```


## ==7. System Endpoints==

##### 7.1. Health Check

**Endpoint:** `GET /health`  
**Authentication:** None (Public)

**Success Response (200):**

```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-10-27T19:00:00.000Z",
  "uptime": 3600.5,
  "memory": {
    "rss": 45678912,
    "heapTotal": 23456789,
    "heapUsed": 12345678,
    "external": 1234567
  }
}
```


---

## ==8. Admin Endpoints== 

##### 8.1. Generate Weekly Report (Admin)

**Endpoint:** `GET /api/v1/admin/reports/weekly/:userId`  
**Authentication:** Required  
**Permissions:** Admin only (scheduled)

**Success Response (200):**

```json
{
  "success": true,
  "message": "Weekly report generated and sent via email",
  "data": {
    "user": {
      "username": "john_doe",
      "email": "john@example.com"
    },
    "period": {
      "from": "2025-10-20T00:00:00.000Z",
      "to": "2025-10-27T00:00:00.000Z"
    },
    "statistics": {
      "notes_created_this_week": 5,
      "total_active_notes": 47,
      "notes_in_trash": 3,
      "total_categories": 6,
      "total_tags": 15,
      "total_attachments": 23,
      "users_shared_with": 8
    }
  }
}
```


##### 8.2. Generate Audit Log Report (Admin)

**Endpoint:** `GET /api/v1/admin/reports/audit`  
**Authentication:** Required  
**Permissions:** Admin only

**Query Parameters:**

- `startDate`: Start date (YYYY-MM-DD)
- `endDate`: End date (YYYY-MM-DD)

**Response:** CSV file download with audit logs

**cURL Example:**

```bash
curl -X GET "http://localhost:3000/api/v1/admin/reports/audit?startDate=2025-01-01&endDate=2025-01-31" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -o audit_log.csv
```

---

## ==9.  WebSocket Events==

###### 9.1 Connecting to WebSocket

```javascript
// Using Socket.IO client
const socket = io('http://localhost:3000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});

socket.on('connect', () => {
  console.log('Connected to WebSocket');
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket');
});
```

##### 9.2 Event: Join Note Room

```javascript
// Join a note room to receive real-time updates
socket.emit('join-note', noteId);
```

##### 9.3 Event: Leave Note Room

```javascript
// Leave a note room
socket.emit('leave-note', noteId);
```

##### 9.4 Event: Receive Notification

```javascript
// Listen for notifications
socket.on('notification', (data) => {
  console.log('Notification:', data);
  // {
  //   type: 'note_shared',
  //   message: 'John shared a note with you: Project Planning',
  //   noteId: 15,
  //   timestamp: '2025-10-27T19:00:00.000Z'
  // }
});
```

##### 9.5 Event: Note Updated

```javascript
// Listen for note updates
socket.on('note-updated', (data) => {
  console.log('Note updated:', data);
  // Refresh note data in UI
});
```

---

## ==10. Response Status Codes==

|Code|Meaning|Usage|
|---|---|---|
|200|OK|Successful GET, PUT, DELETE|
|201|Created|Successful POST (resource created)|
|400|Bad Request|Validation errors, invalid data|
|401|Unauthorized|Missing or invalid token|
|403|Forbidden|No permission to access resource|
|404|Not Found|Resource doesn't exist|
|429|Too Many Requests|Rate limit exceeded|
|500|Internal Server Error|Server error|

---


