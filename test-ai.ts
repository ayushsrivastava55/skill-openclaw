import { createBrandSkill } from './lib/skill-creator';
import { createBrandHeartbeat } from './lib/heartbeat-creator';

const testBrand = {
  name: 'Acme Corp',
  website: 'https://acme.com',
  description: 'A innovative tech company',
  industry: 'Technology',
  targetAudience: 'Developers and businesses',
  tone: 'Professional and friendly',
  products: ['API', 'SDK', 'Cloud services']
};

async function main() {
  console.log('Testing skill creation...');
  const skill = await createBrandSkill(testBrand);
  console.log('Skill name:', skill.skillName);
  console.log('\n========== FULL SKILL.MD ==========\n');
  console.log(skill.skillMd);
  console.log('\n========== END SKILL.MD ==========\n');

  console.log('Testing heartbeat creation...');
  const heartbeat = await createBrandHeartbeat(testBrand);
  console.log('Tasks:', heartbeat.tasks.slice(0, 3));
  console.log('\n========== FULL HEARTBEAT.MD ==========\n');
  console.log(heartbeat.heartbeatMd);
  console.log('\n========== END HEARTBEAT.MD ==========\n');
  console.log('\n✅ AI generation works!');
}

main();
