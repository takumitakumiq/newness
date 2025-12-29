# agent.md: Project "MATSU" - Architecture & Implementation Guide

## 1. Project Identity
**System Name:** Rakusei Cultural Festival Ticket System (Code Name: MATSU)
**Role:** Senior Full-Stack Developer & UI/UX Designer.
**Core Philosophy:** "Robust Logic, Fluid Experience."
**Goal:** Build a festival ticketing system that handles complex entry rules (quotas, dynamic forms) with an intuitive, mobile-first, and highly aesthetic "Festival Modern" interface.

---

## 2. Technology Stack (Strict Constraints)

### Frontend (User Interface)
* **Framework:** Next.js 14+ (App Router, TypeScript).
* **Styling:** Tailwind CSS + **shadcn/ui** (Radix Primitives).
* **State Management:** **Zustand** (Crucial for global Cart & User Attribute state).
* **Forms:** React Hook Form + **Zod** (Schema validation).
* **Animation:** **Framer Motion** (For smooth cart transitions and modal interactions).
* **Icons:** Lucide React.

### Backend (API & Logic)
* **Framework:** Django 5.x.
* **API:** Django REST Framework (DRF).
* **Database:** PostgreSQL (Must use `JSONB` for dynamic data).
* **Admin UI:** **django-unfold** (Modern Tailwind-based admin interface).
* **Utilities:** `django-cors-headers`, `django-filter`.

---

## 3. Database Schema Architecture

The database must support "Attribute-based Quotas" and "Dynamic Forms".

### `api_entryslot` (Master Data)
Defines when the festival is open.
* `id`: ID
* `event_date`: Date (e.g., 2025-10-25)
* `start_time`: Time (e.g., 10:00)
* `capacity`: Int (Total available spots per slot)
* `is_active`: Boolean

### `api_attributeconfig` (Master Data - Critical)
Defines rules for each user type (Student, Parent, General).
* `target_type`: String (Unique. e.g., 'parent', 'student')
* `max_total_limit`: Int (e.g., Parent=5, Student=2) - **Purchase Quota**
* `form_schema`: **JSONB** (The questions to ask. JSON Schema format)
    * *Example:* `[{"key": "car", "label": "Use Parking?", "type": "boolean"}]`

### `api_reservation` (Transaction)
Represents a checkout session.
* `id`: String (R-UUID)
* `user_id`: String (The representative's ID or email)
* `total_tickets`: Int
* `created_at`: Datetime

### `api_ticket` (Individual Rights)
One row per person. Linked to the Reservation.
* `id`: UUID (The content of the Static QR Code)
* `reservation`: FK to `api_reservation`
* `slot`: FK to `api_entryslot`
* `user_type`: FK/String link to `api_attributeconfig`
* `guest_info`: **JSONB** (Answers to the `form_schema`. e.g., `{"car": true}`)
* `status`: String ('valid', 'entered', 'used')
* `entered_at`: Datetime (Nullable)

---

## 4. Business Logic & API Requirements

### 4.1. The "Cart" & Quota Logic (Frontend + Backend)
1.  **Selection:** User selects an Attribute (e.g., Parent).
2.  **Frontend Validation:** Before adding to cart, check: `Current_Cart_Count <= Attribute.max_total_limit`.
3.  **Cart State:** The cart can hold tickets for **different time slots** simultaneously (e.g., 2 tickets for Sat 10:00, 1 ticket for Sun 13:00).

### 4.2. Checkout Transaction (Backend)
Endpoint: `POST /api/checkout/`
* **Input:** List of `{ slot_id, user_type, guest_info }`.
* **Process (Atomic Transaction):**
    1.  **Lock Inventory:** Calculate total requested per slot. Check if `Slot.capacity >= Current_Booked + Request`.
    2.  **Verify Quota:** Check if `Request_Count <= Attribute.max_total_limit`.
    3.  **Save:** Create 1 Reservation and N Ticket records.
* **Output:** Reservation ID and List of Ticket UUIDs.

### 4.3. Dynamic Form Rendering
* Frontend fetches `AttributeConfig` list on load.
* When a ticket is in the cart, render the corresponding inputs based on `form_schema`.
* Use `AnimatePresence` (Framer Motion) to smoothly expand/collapse form fields.

### 4.4. QR Check-in (Gate System)
Endpoint: `POST /api/checkin/`
* **Input:** `{ ticket_uuid }`
* **Logic:**
    * Find Ticket.
    * If `status == 'valid'` -> Update to `entered`, Return **Success (200)**.
    * If `status == 'entered'` -> Return **Error (409) "Already Inside"**.
    * If `status == 'used'` -> Return **Error (410) "Invalid"**.

---

## 5. Design & UI/UX Directives

**Theme:** "Festival Modern" (Cyber-physical vibe).
**Colors:** Deep Indigo/Violet backgrounds, Neon Blue accents, Glassmorphism cards.

### Key Components
* **TimeSlotPicker:** Not a dropdown. Use a grid of selectable cards showing real-time availability (e.g., "Few Left" badge).
* **The "Smart" Cart:** A sticky bottom bar on mobile (Drawer) that expands to show selected tickets.
* **Ticket Wallet:** The "My Page" should look like Apple Wallet. Each ticket is a card with a distinct header color based on the date.
* **Dark Mode:** The interface must be optimized for Dark Mode first.

---

## 6. Directory Structure (Scaffold)

```text
rakusei-fest-sys/
├── backend/            # Django Root
│   ├── manage.py
│   ├── core/           # Settings
│   └── api/            # App (Models, Views, Serializers)
└── frontend/           # Next.js Root
    ├── app/            # App Router (page.tsx, checkout/...)
    ├── components/     # shadcn/ui & custom components
    ├── lib/            # utils, api-client, zod-schemas
    └── store/          # Zustand (useCartStore.ts)
