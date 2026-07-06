const CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

export async function refreshGoogleToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${await response.text()}`);
  }

  return await response.json() as {
    access_token: string;
    expires_in: number;
    token_type: string;
    refresh_token?: string;
  };
}

export async function getGoogleUserInfo(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${await response.text()}`);
  }

  return await response.json() as {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };
}

export async function fetchGoogleQuota(accessToken: string) {
  let projectId: string | null = null;
  let subscriptionTier = 'Free';
  let creditsAmount: number | null = null;

  // 1. Fetch Project Context (loadCodeAssist)
  try {
    const response = await fetch('https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'CloudCode/24.1.1 (Antigravity)',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } }),
    });

    if (response.ok) {
      const data = await response.json() as any;
      projectId = data.cloudaicompanionProject || null;
      if (data.paidTier) {
        subscriptionTier = data.paidTier.name || data.paidTier.id || subscriptionTier;
        const credit = data.paidTier.availableCredits?.[0];
        if (credit) {
          creditsAmount = Number(credit.creditAmount) || 0;
        }
      } else if (data.currentTier) {
        subscriptionTier = data.currentTier.name || data.currentTier.id || subscriptionTier;
      }
    }
  } catch (e) {
    console.error('[GoogleAPI] Error loading project context:', e);
  }

  // 2. Fetch Models Quota
  let models: Record<string, any> = {};
  try {
    const response = await fetch('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'CloudCode/24.1.1 (Antigravity)',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(projectId ? { project: projectId } : {}),
    });

    if (response.ok) {
      const data = await response.json() as any;
      if (data.models) {
        for (const [modelName, info] of Object.entries(data.models) as any) {
          if (info.quotaInfo) {
            const fraction = info.quotaInfo.remainingFraction ?? 0;
            models[modelName] = {
              percentage: Math.floor(fraction * 100),
              resetTime: info.quotaInfo.resetTime || '',
              display_name: info.displayName || modelName.replace('models/', ''),
              supports_images: info.supportsImages || false,
              supports_thinking: info.supportsThinking || false,
              thinking_budget: info.thinkingBudget || 0,
              recommended: info.recommended || false,
              max_tokens: info.maxTokens || 0,
              max_output_tokens: info.maxOutputTokens || 0,
            };
          }
        }
      }
    }
  } catch (e) {
    console.error('[GoogleAPI] Error loading models quota:', e);
  }

  // 3. Fetch Credits (fallback if not loaded)
  if (creditsAmount === null) {
    try {
      const response = await fetch('https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'CloudCode/24.1.1 (Antigravity)',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            ide_type: 'ANTIGRAVITY',
            ide_version: '1.0.16',
            ide_name: 'antigravity',
          },
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const credit = data.paidTier?.availableCredits?.[0];
        if (credit) {
          creditsAmount = Number(credit.creditAmount) || 0;
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  return {
    models,
    subscription_tier: subscriptionTier,
    ai_credits: creditsAmount !== null ? { credits: creditsAmount, expiryDate: '' } : undefined,
  };
}
