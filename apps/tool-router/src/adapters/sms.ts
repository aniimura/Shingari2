import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';

const client = new PinpointSMSVoiceV2Client({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });

export async function sendSms(args: {
  toPhoneE164: string;
  body: string;
  originationIdentity: string;
}): Promise<void> {
  await client.send(
    new SendTextMessageCommand({
      DestinationPhoneNumber: args.toPhoneE164,
      MessageBody: args.body,
      OriginationIdentity: args.originationIdentity,
      MessageType: 'TRANSACTIONAL',
    }),
  );
}
