import { createBrandDeploymentConfig, prepareBrandFilesForDeployment } from './lib/brand-deploy';
import { dispatchRuntimeDeployment } from './lib/runtime-executor';

const testBrand = {
  name: 'TestBrand',
  website: 'https://testbrand.com',
  description: 'A test brand for verification',
  industry: 'Tech',
  targetAudience: 'Everyone',
  tone: 'Friendly',
  products: ['Product1', 'Product2']
};

const testConfig = {
  userId: 'test-user-123',
  deploymentId: 'deploy-test-012',
  model: 'openrouter/openai/gpt-5.2' as const,
  channel: 'telegram' as const,
  channelToken: 'TELEGRAM_TOKEN_HERE',
  modelApiKey: 'OPENROUTER_KEY_HERE'
};

async function main() {
  console.log('1. Creating brand config...');
  const brandConfig = await createBrandDeploymentConfig(testBrand, true);
  
  console.log('   Raw skill length:', brandConfig.skill.skillMd.length);
  console.log('   Raw skill preview:', brandConfig.skill.skillMd.slice(0, 200));
  
  console.log('\n2. Preparing files...');
  const brandFiles = prepareBrandFilesForDeployment(testConfig.deploymentId, brandConfig);
  
  console.log('   Formatted skill length:', brandFiles.skillContent.length);
  console.log('   Formatted skill preview:', brandFiles.skillContent.slice(0, 300));
  
  const result = await dispatchRuntimeDeployment({
    deploymentId: testConfig.deploymentId,
    userId: testConfig.userId,
    slotId: `slot-${testConfig.deploymentId}`,
    provider: 'openrouter',
    model: testConfig.model,
    channel: testConfig.channel,
    channelPrimaryToken: testConfig.channelToken,
    modelApiKey: testConfig.modelApiKey,
    brandConfig: {
      skillContent: brandFiles.skillContent,
      skillFileName: brandFiles.skillFileName,
      heartbeatContent: brandFiles.heartbeatContent,
      heartbeatFileName: brandFiles.heartbeatFileName,
    }
  });
  
  console.log('\nResult:', result.accepted ? 'SUCCESS' : 'FAILED - ' + result.reason);
}

main().catch(console.error);
