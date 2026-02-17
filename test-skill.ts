import { createBrandSkill } from './lib/skill-creator';

const skill = await createBrandSkill({
  name: 'TestBrand',
  website: 'https://testbrand.com',
  description: 'A test brand',
  industry: 'Tech',
  targetAudience: 'Everyone',
  tone: 'Friendly',
  products: ['Product1', 'Product2']
});

console.log('Length:', skill.skillMd.length);
console.log('---');
console.log(skill.skillMd);
