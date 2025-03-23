# GovLens Backend

A backend system for integrating with the Congress API, built with Python, PostgreSQL, SQLAlchemy, and Alembic.

## Project Structure

```
govlens-backend/
├── app/
│   ├── models/
│   │   ├── congress.py     # Bill and Congressman models
│   ├── schemas/            # Pydantic schemas (to be implemented)
│   ├── services/           # Service layer (to be implemented)
│   ├── api/                # API endpoints (to be implemented)
│   └── database.py         # Database connection setup
├── migrations/             # Alembic migrations
├── scripts/                # Utility scripts
├── tests/                  # Test directory
├── alembic.ini             # Alembic configuration
├── Pipfile                 # Dependency management
├── docker-compose.yml      # Docker configuration
├── Dockerfile              # Docker image definition
└── README.md               # Project documentation
```

## Models

The project includes two main models:

1. **Congressman**: Represents members of Congress (both Representatives and Senators)
   - Uses enums for Party and Chamber fields
   - Has relationships to sponsored and cosponsored bills

2. **Bill**: Represents legislative bills
   - Stores policy areas as an array field
   - Has relationships to sponsors and cosponsors

## Docker Setup

The project uses Docker and Docker Compose for local development:

```bash
# Start the containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the containers
docker-compose down
```

## Database Configuration

The application uses a single DATABASE_URL environment variable:

- For Docker: Set `DATABASE_URL=postgresql://govlens:govlens@db:5432/govlens`
- For local development: Set `DATABASE_URL=postgresql://govlens:govlens@localhost:5432/govlens`

## Development Workflow

### Running Migrations

```bash
# Generate a migration
alembic revision --autogenerate -m "Description of changes"

# Apply migrations
alembic upgrade head

# Roll back a migration
alembic downgrade -1
```

### Environment Variables

Copy `.env.example` to `.env` and update with your configuration:

```
# Database configuration
DATABASE_URL=postgresql://govlens:govlens@localhost:5432/govlens

# API Keys
CONGRESS_API_KEY=your_congress_api_key_here
```

## API Access

When running with Docker Compose, the API is available at:

- http://localhost:8000
- API documentation: http://localhost:8000/docs
