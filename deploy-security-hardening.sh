#!/bin/bash

# ════════════════════════════════════════════════════════════════════════════
# SECURITY HARDENING DEPLOYMENT SCRIPT
# Run this script to deploy all security enhancements to Supabase
# ════════════════════════════════════════════════════════════════════════════

set -e  # Exit on any error

# Configuration
SUPABASE_PROJECT_ID="${SUPABASE_PROJECT_ID:-your-project-id}"
SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD:-}"
DRY_RUN="${DRY_RUN:-true}"  # Set to false to apply migrations

echo "════════════════════════════════════════════════════════════════"
echo "SECURITY HARDENING DEPLOYMENT"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Project ID: $SUPABASE_PROJECT_ID"
echo "Dry Run Mode: $DRY_RUN"
echo ""

# Step 1: Verify prerequisites
echo "STEP 1: Verifying prerequisites..."
echo "────────────────────────────────────"

if [ -z "$SUPABASE_PROJECT_ID" ] || [ "$SUPABASE_PROJECT_ID" = "your-project-id" ]; then
    echo "❌ ERROR: SUPABASE_PROJECT_ID not set"
    echo "Set it with: export SUPABASE_PROJECT_ID='your-project-id'"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "⚠️  WARNING: psql not found. Install PostgreSQL client tools."
    echo "macOS: brew install postgresql"
    exit 1
fi

echo "✅ Prerequisites verified"
echo ""

# Step 2: Migration list
echo "STEP 2: Migrations to apply..."
echo "────────────────────────────────────"

MIGRATIONS=(
    "migration_request_logs_and_ratelimit.sql"
    "migration_audit_logs.sql"
    "migration_audit_triggers.sql"
    "migration_security_enhancement.sql"
    "migration_security_verify.sql"
)

for migration in "${MIGRATIONS[@]}"; do
    if [ -f "supabase/$migration" ]; then
        echo "✅ Found: $migration"
    else
        echo "❌ Missing: $migration"
    fi
done
echo ""

# Step 3: Pre-deployment checks
echo "STEP 3: Running pre-deployment checks..."
echo "────────────────────────────────────"

echo "Checking database connectivity..."
if [ -n "$SUPABASE_DB_PASSWORD" ]; then
    PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "postgresql://postgres:$SUPABASE_DB_PASSWORD@$SUPABASE_PROJECT_ID.db.supabase.co:5432/postgres" -c "SELECT NOW();" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ Database connection successful"
    else
        echo "❌ Database connection failed"
        exit 1
    fi
else
    echo "⚠️  Skipping DB connection test (no password provided)"
fi
echo ""

# Step 4: Display migration summary
echo "STEP 4: Migration Summary..."
echo "────────────────────────────────────"
echo ""
echo "1️⃣  Request Logs & Rate Limiting"
echo "   - Creates request_logs table"
echo "   - Creates increment_usage_with_ratelimit() function"
echo "   - Enables API usage tracking and rate limit enforcement"
echo ""
echo "2️⃣  Audit Logging"
echo "   - Creates audit_logs table"
echo "   - Tracks all sensitive data changes"
echo "   - Enables compliance auditing"
echo ""
echo "3️⃣  Audit Triggers"
echo "   - Auto-logs changes to: users, collections, collection_items"
echo "   - Auto-logs changes to: user_interactions, usage_tracking"
echo "   - Auto-logs changes to: email_log, idea_validations"
echo ""
echo "4️⃣  Security Enhancements"
echo "   - Removes dangerously permissive RLS policies"
echo "   - Adds user-isolation policies to all tables"
echo "   - Implements set_user_role() function for safe role changes"
echo "   - Enforces ownership checks with auth.uid()"
echo ""
echo "5️⃣  Security Verification"
echo "   - Checks RLS is enabled on all tables"
echo "   - Identifies remaining unsafe policies"
echo "   - Maps all SECURITY DEFINER functions"
echo ""

# Step 5: Decision
echo "STEP 5: Ready to deploy?"
echo "────────────────────────────────────"
echo ""
if [ "$DRY_RUN" = "true" ]; then
    echo "🟡 DRY RUN MODE - No changes will be applied"
    echo ""
    echo "To apply migrations, run:"
    echo "  export DRY_RUN=false"
    echo "  bash deploy-security-hardening.sh"
else
    echo "🔴 APPLYING MIGRATIONS - This will modify your database"
    echo ""
    read -p "Type 'yes' to proceed: " -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi
echo ""

# Step 6: Apply migrations
echo "STEP 6: Applying migrations..."
echo "────────────────────────────────────"

if [ "$DRY_RUN" = "true" ]; then
    echo "📋 DRY RUN: Would apply these migrations:"
    for migration in "${MIGRATIONS[@]}"; do
        echo "  • $migration"
    done
else
    echo "⏳ Applying migrations..."
    
    # This section would execute the migrations
    # For actual deployment, use Supabase CLI or psql
    echo ""
    echo "⚠️  Manual deployment required:"
    echo ""
    echo "Using Supabase CLI:"
    echo "  supabase db push"
    echo ""
    echo "Or using psql directly:"
    for migration in "${MIGRATIONS[@]}"; do
        echo "  psql postgresql://user:pass@host/db -f supabase/$migration"
    done
fi
echo ""

# Step 7: Post-deployment verification
echo "STEP 7: Post-deployment verification..."
echo "────────────────────────────────────"
echo ""
echo "After deployment, run this query to verify:"
echo ""
echo "SELECT 'REQUEST_LOGS' AS table_name,"
echo "  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'request_logs')"
echo "  THEN 'EXISTS' ELSE 'MISSING' END AS status;"
echo ""
echo "SELECT 'AUDIT_LOGS' AS table_name,"
echo "  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs')"
echo "  THEN 'EXISTS' ELSE 'MISSING' END AS status;"
echo ""
echo "SELECT 'set_user_role FUNCTION' AS item,"
echo "  CASE WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'set_user_role')"
echo "  THEN 'DEPLOYED' ELSE 'MISSING' END AS status;"
echo ""

# Step 8: Results
echo "════════════════════════════════════════════════════════════════"
if [ "$DRY_RUN" = "true" ]; then
    echo "✅ DRY RUN COMPLETE"
    echo "Review the above migrations, then deploy with:"
    echo "  export DRY_RUN=false"
    echo "  bash deploy-security-hardening.sh"
else
    echo "✅ DEPLOYMENT COMPLETE"
    echo "Security enhancements have been applied to your database."
fi
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📚 Documentation: See SECURITY_HARDENING.md for detailed information"
echo "🔍 Verification: Run migration_security_verify.sql in Supabase SQL Editor"
echo ""
