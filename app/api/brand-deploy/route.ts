import { NextRequest, NextResponse } from "next/server";
import { createBrandDeploymentConfig, prepareBrandFilesForDeployment } from "@/lib/brand-deploy";
import { dispatchRuntimeDeployment } from "@/lib/runtime-executor";
import { getDeploymentById, updateDeploymentById } from "@/lib/store";
import { encrypt } from "@/lib/security";
import type { BrandConfig } from "@/lib/brand-types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      userId,
      deploymentId,
      model,
      channel,
      channelToken,
      modelApiKey,
      brand,
    } = body as {
      userId: string;
      deploymentId: string;
      model: string;
      channel: string;
      channelToken: string;
      modelApiKey: string;
      brand: BrandConfig;
    };

    if (!userId || !deploymentId || !brand) {
      return NextResponse.json(
        { error: "Missing required fields: userId, deploymentId, brand" },
        { status: 400 }
      );
    }

    const deployment = await getDeploymentById(deploymentId);
    if (!deployment || deployment.userId !== userId) {
      return NextResponse.json(
        { error: "Deployment not found" },
        { status: 404 }
      );
    }

    const brandConfig = await createBrandDeploymentConfig(brand, true);
    
    const brandFiles = prepareBrandFilesForDeployment(deploymentId, brandConfig);

    const encryptedChannelToken = encrypt(channelToken);
    const encryptedModelApiKey = modelApiKey ? encrypt(modelApiKey) : null;

    const result = await dispatchRuntimeDeployment({
      deploymentId,
      userId,
      slotId: deployment.runtimeSlotId || `slot-${deploymentId}`,
      provider: "openrouter",
      model: model as any,
      channel: channel as any,
      channelPrimaryToken: channelToken,
      modelApiKey: modelApiKey,
      brandConfig: {
        skillContent: brandFiles.skillContent,
        skillFileName: brandFiles.skillFileName,
        heartbeatContent: brandFiles.heartbeatContent,
        heartbeatFileName: brandFiles.heartbeatFileName,
      },
    });

    if (!result.accepted) {
      return NextResponse.json(
        { error: result.reason },
        { status: 400 }
      );
    }

    await updateDeploymentById(deploymentId, {
      status: "setup_started",
      encryptedChannelPrimaryToken: encryptedChannelToken,
      encryptedModelApiKey: encryptedModelApiKey,
    });

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      mode: result.mode,
      skillName: brandFiles.skillFileName,
      heartbeatFileName: brandFiles.heartbeatFileName,
    });
  } catch (error) {
    console.error("Brand deployment error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deployment failed" },
      { status: 500 }
    );
  }
}
