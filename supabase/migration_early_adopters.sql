-- ═══════════════════════════════════════════════════════════════════
-- EARLY ADOPTER FLAG MIGRATION
-- Run in Supabase SQL Editor
--
-- 1. Adds is_early_adopter BOOLEAN column to users table
-- 2. Flags all 65 early adopters (from Resend contacts CSV) as true
-- 3. Creates index for fast lookup in email functions
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Add column (default false for all new users)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_early_adopter BOOLEAN DEFAULT false;

-- Step 2: Flag all 65 early adopters by email
UPDATE public.users
SET is_early_adopter = true
WHERE email IN (
  'waqashaiderofficial8@gmail.com',
  'goldenbird4750@gmail.com',
  'skunk07194@mailshan.com',
  'hashamshafqat1@gmail.com',
  'vishnu88sankaran@gmail.com',
  'saima211855@gmail.com',
  'rahul.r83519@gmail.com',
  'kaganb78@gmail.com',
  'xoromo9370@muhaos.com',
  'kumarparinita3@gmail.com',
  'saadick@gmail.com',
  'treyorr20@gmail.com',
  'hgyinjian@gmail.com',
  'arnavanandman@gmail.com',
  'david.l.adell11@gmail.com',
  'yogeshkashyap838@gmail.com',
  'artyagi2011@gmail.com',
  'shivamsingh658125@gmail.com',
  'angelcakemusica@gmail.com',
  'lucasntaraujo@gmail.com',
  'omkumar40@gmail.com',
  'mohammedkhalid777999@gmail.com',
  'ashish@solarsavingsalliance.com',
  'sixfigureconsulting03@gmail.com',
  'gagangowda.n15@gmail.com',
  'bhaveeh3434@gmail.com',
  'sharanshpanwar987@gmail.com',
  'tgabriel324@gmail.com',
  'nishantpatankar15204@gmail.com',
  'rebecca@growthmagnetstudio.com',
  'mohit123@gmail.com',
  'israelabebe652@gmail.com',
  'jaheimp401@gmail.com',
  'ryan@moonz.live',
  'doseyiw691@desiys.com',
  'anshumansp16@gmail.com',
  'sardaralimateen012@gmail.com',
  'sathya640@gmail.com',
  'skoul4358@gmail.com',
  'jay@tmail.edu.rs',
  'shreyanshs256@gmail.com',
  'davejharrop@gmail.com',
  'edmond.laytte@gmail.com',
  'bond17964@gmail.com',
  '1naouguh@gmail.com',
  'rehaan.45650@gmail.com',
  'khizermughal878@gmail.com',
  'rogerlai199@gmail.com',
  'omkargayake043@gmail.com',
  'shivamanujit@gmail.com',
  'navigationzsystems@gmail.com',
  'arbusiness44@gmail.com',
  'garagefitness4@gmail.com',
  'lgwebosutkarsh@gmail.com',
  'prathamkaushik1983@gmail.com',
  'terraplay2005@gmail.com',
  'bryce@madebynova.com',
  'kellymarahanna@gmail.com',
  'b4bharasta@gmail.com',
  'arvind.girish12@gmail.com',
  'reddykalyan666@gmail.com',
  'kartike24@gmail.com',
  'sudhirmohandma@gmail.com',
  'ifyatech@gmail.com',
  'ankitsingh17021990@gmail.com'
);

-- Step 3: Index for fast lookup in edge functions
CREATE INDEX IF NOT EXISTS idx_users_early_adopter
  ON public.users(is_early_adopter) WHERE is_early_adopter = true;

-- Verify: count how many users got flagged
SELECT count(*) as flagged_early_adopters FROM public.users WHERE is_early_adopter = true;
