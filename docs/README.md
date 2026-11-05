# Premium Retail POS — Documentation Index

> Central hub for all project documentation, specifications, and implementation guides.

---

## 📚 Core Documentation

### 🧭 [ROADMAP.md](./ROADMAP.md)
**Development Roadmap & Feature Tracker**

The living task tracker and project compass documenting:
- Current project status (~15% complete)
- 12 development phases with milestone definitions
- Priority tiers (P0 — Essential to P3 — Optional)
- 20 Open Decisions requiring stakeholder confirmation
- Out-of-scope capabilities and commercial boundaries

**Key Sections:**
- Current Focus & Immediate Next Tasks
- Phased Development Plan (Phase 1 ➔ Phase 12)
- Open Decisions Tracker (`OD-01` to `OD-20`)
- Resolved Decisions (`OD-01`, `OD-03`, `OD-04`, `OD-07`, `OD-11`)

**When to Read:** Before starting any new feature or module to understand dependencies and priorities.

---

### 🏛️ [ARCHITECTURE.md](./ARCHITECTURE.md)
**System Architecture & Technical Design**

Comprehensive technical specification covering:
- Proposed Next.js/NestJS/Prisma/PostgreSQL stack
- Module boundaries and responsibilities (12 domain modules)
- 14 Critical Data Integrity Invariants (immutable ledger, canonical base units, etc.)
- 11 Architectural Decision Records (ADRs)
- Dual-axis authorization matrix (RBAC + Location Scope)
- Security controls and testing strategy
- Data flow diagrams and sequence diagrams

**Key Sections:**
- Data Integrity & Critical Invariants (14 rules)
- ADRs (ADR-001 through ADR-011)
- Module Boundaries (Identity, Catalog, Inventory, POS, etc.)
- Security Architecture (Authentication, Authorization Matrix)

**When to Read:** Before implementing any module to understand business rules, invariants, and security constraints.

---

### 📜 [CHANGELOG.md](./CHANGELOG.md)
**Version History & Change Log**

Chronological record of all project changes following [Keep a Changelog](https://keepachangelog.com/) format:
- Added features and capabilities
- Changed behaviors and breaking updates
- Deprecated functionality
- Removed features
- Fixed bugs
- Security patches

**Key Sections:**
- [Unreleased] — Current development work
- Phase 1 Foundation & Bootstrap progress
- Specification Invariants Baseline
- Architectural Decisions Confirmed

**When to Read:** To understand what has been implemented, what changed, and the evolution of the codebase.

---

### 🧪 [TESTING-GUIDE.md](./TESTING-GUIDE.md)
**Complete Manual Testing Guide**

Step-by-step testing manual covering:
- 9 testing phases with 60+ specific tests
- Expected outputs and verification steps
- Troubleshooting for each phase
- Success criteria and deliverables
- Screenshots guidance

**Key Sections:**
- Phase 1-3: Environment, Database, Server Setup
- Phase 4-6: Health, Auth, Company, Location Testing
- Phase 7-9: Authorization Guards, Validation, Edge Cases
- Test results summary and checklist

**When to Read:** During initial setup and when validating features work correctly.

---

## 📐 Documentation Standards

### File Naming Conventions
- Use `UPPERCASE.md` for root-level architectural docs
- Use `PascalCase.md` for feature-specific guides
- Use `kebab-case.md` for implementation notes

### Writing Style
- Clear, concise, and technical
- Use diagrams where helpful (Mermaid supported)
- Include code examples with syntax highlighting
- Link to related documents extensively
- Keep ToC updated for long documents

### Maintenance
- Update CHANGELOG.md after every significant change
- Keep ROADMAP.md current with task completion status
- Mark resolved Open Decisions with status and date

---

## 🔗 Quick Links

| Document | Purpose | Last Updated |
|----------|---------|--------------|
| [README.md](../README.md) | Project overview & setup guide | Phase 1 |
| [ROADMAP.md](./ROADMAP.md) | Development phases & task tracker | Phase 1 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical design & invariants | Phase 1 |
| [CHANGELOG.md](./CHANGELOG.md) | Version history | Phase 1 |
| [TESTING-GUIDE.md](./TESTING-GUIDE.md) | Complete manual testing guide | Phase 1 |

---

## 📁 Documentation Structure

```text
docs/
├── README.md                  # This file — documentation index
├── ROADMAP.md                 # Development roadmap (20+ pages)
├── ARCHITECTURE.md            # Technical architecture (30+ pages)
├── CHANGELOG.md               # Version history
├── TESTING-GUIDE.md           # Complete manual testing guide
├── api/                       # API-specific documentation
│   ├── endpoints.md           # API endpoint reference (TODO)
│   └── authentication.md      # Auth flows and JWT (TODO)
└── guides/                    # Implementation guides
    ├── setup.md               # Development environment setup (TODO)
    └── deployment.md          # Production deployment guide (TODO)
```

---

## 🎯 For Different Roles

### **Developers**
Start here:
1. [README.md](../README.md) — Understand project scope
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — Learn system design
3. [TESTING-GUIDE.md](./TESTING-GUIDE.md) — Setup and test

### **Project Managers**
Start here:
1. [ROADMAP.md](./ROADMAP.md) — Track progress and phases
2. [CHANGELOG.md](./CHANGELOG.md) — Review completed work

### **Architects/Tech Leads**
Start here:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) — Review technical decisions
2. [ROADMAP.md](./ROADMAP.md) — Assess open decisions
3. [CHANGELOG.md](./CHANGELOG.md) — Track architectural evolution

### **QA/Testers**
Start here:
1. [TESTING-GUIDE.md](./TESTING-GUIDE.md) — Complete testing procedures
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — Understand invariants to test

---

## 🔍 Searching the Documentation

### By Topic
- **Authentication/Authorization**: ARCHITECTURE.md → 7 Security Architecture
- **Business Rules**: ARCHITECTURE.md → 5 Data Integrity Invariants
- **Module Implementation**: ROADMAP.md → 4 Development Phases
- **Open Questions**: ROADMAP.md → 5 Open Decisions

### By Priority
- **P0 (Critical)**: ROADMAP.md — filter by P0 tags
- **Blockers**: ROADMAP.md → 5 Open Decisions (Status column)

### By Phase
- **Phase 1**: Foundation & Bootstrap (In Progress)
- **Phase 2**: Company, Users, Roles
- **Phase 3**: Product Catalogue
- **Phase 4**: Inventory Ledger
- **Phase 5**: Transfers
- **Phase 6**: POS Billing
- **Phases 7-12**: See ROADMAP.md

---

## ✍️ Contributing to Documentation

1. **Keep it up-to-date**: Update docs with code changes
2. **Link extensively**: Reference related sections
3. **Use examples**: Show, don't just tell
4. **Maintain consistency**: Follow existing format
5. **Review regularly**: Docs should reflect current reality

---

## ❓ Questions?

If documentation is unclear or incomplete:
1. Check if an Open Decision addresses it (ROADMAP.md → 5)
2. Review related ADRs (ARCHITECTURE.md → 6)
3. Search CHANGELOG.md for recent changes
4. Raise the question with the team lead

---

**Last Updated:** Phase 1
**Maintainer:** Development Team  
**Status:** Living Documentation — Updated Continuously
