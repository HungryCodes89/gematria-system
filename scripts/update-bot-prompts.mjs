import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const BOT_B_RULES = `

BETTING RULES:
- Triple Lock (3+ signals): Bet 3-5 units, confidence 75-95%
- Double Lock (2 signals): Bet 2-3 units, confidence 60-75%
- Single Lock (1 signal): Bet 1 unit, confidence 55-60%
- No Lock: Skip
- 36=666 confirmed: Bet OPPONENT 2-3 units
- Triple milestone: Maximum units
- Consensus with AJ bot: Add 1 unit
- Never exceed 3 units during validation phase`;

const BOT_C_RULES = `

BETTING RULES:
- Triple Lock (3+ cipher alignments): Bet 3-5 units, confidence 75-95%
- Double Lock (2 alignments): Bet 2-3 units, confidence 60-75%
- Single Lock (1 alignment): Bet 1 unit, confidence 55-60%
- No Lock: Skip
- 36=666 sacrifice marker: Bet OPPONENT 2-3 units
- 33 date numerology: Increase confidence by 1 tier
- 201 appearing: Maximum units on Triple Lock
- 113 appearing: Reduce units by 1, expect upset
- Consensus with Zach bot: Add 1 unit
- Never exceed 3 units during validation phase`;

async function updatePrompts() {
  // Fetch current prompts
  const { data, error } = await supabase
    .from('gematria_settings')
    .select('id, bot_b_system_prompt, bot_c_system_prompt')
    .limit(1)
    .single();

  if (error) {
    console.error('Fetch error:', error.message);
    process.exit(1);
  }

  console.log('Fetched row id:', data.id);
  console.log('Bot B prompt length (before):', data.bot_b_system_prompt?.length ?? 0);
  console.log('Bot C prompt length (before):', data.bot_c_system_prompt?.length ?? 0);

  const newBotB = (data.bot_b_system_prompt ?? '') + BOT_B_RULES;
  const newBotC = (data.bot_c_system_prompt ?? '') + BOT_C_RULES;

  // Update
  const { error: updateError } = await supabase
    .from('gematria_settings')
    .update({
      bot_b_system_prompt: newBotB,
      bot_c_system_prompt: newBotC,
    })
    .eq('id', data.id);

  if (updateError) {
    console.error('Update error:', updateError.message);
    process.exit(1);
  }

  // Read back to confirm
  const { data: verify, error: verifyError } = await supabase
    .from('gematria_settings')
    .select('bot_b_system_prompt, bot_c_system_prompt')
    .eq('id', data.id)
    .single();

  if (verifyError) {
    console.error('Verify error:', verifyError.message);
    process.exit(1);
  }

  const bLen = verify.bot_b_system_prompt?.length ?? 0;
  const cLen = verify.bot_c_system_prompt?.length ?? 0;

  console.log('\n--- VERIFICATION ---');
  console.log(`Bot B prompt length (after): ${bLen}`);
  console.log('Bot B last 200 chars:', verify.bot_b_system_prompt.slice(-200));
  console.log(`\nBot C prompt length (after): ${cLen}`);
  console.log('Bot C last 200 chars:', verify.bot_c_system_prompt.slice(-200));
  console.log('\nUpdate successful.');
}

updatePrompts();
