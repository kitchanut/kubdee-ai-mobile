import { BACKEND_URL } from '@/auth/constants';

const VOICE_SAMPLE_NAMES = new Set([
  'Achird',
  'Achernar',
  'Algenib',
  'Algieba',
  'Alnilam',
  'Aoede',
  'Autonoe',
  'Callirrhoe',
  'Charon',
  'Despina',
  'Enceladus',
  'Erinome',
  'Fenrir',
  'Gacrux',
  'Iapetus',
  'Kore',
  'Laomedeia',
  'Leda',
  'Orus',
  'Pulcherrima',
  'Puck',
  'Rasalgethi',
  'Sadachbia',
  'Sadaltager',
  'Schedar',
  'Sulafat',
  'Umbriel',
  'Vindemiatrix',
  'Zubenelgenubi',
  'Zephyr',
]);

export function getVoicePreviewName(voiceCharacter?: string): string {
  const directVoice = voiceCharacter?.startsWith('tts_') ? voiceCharacter.replace(/^tts_/, '') : '';
  if (directVoice) {
    return directVoice.charAt(0).toUpperCase() + directVoice.slice(1).toLowerCase();
  }

  const voiceMap: Record<string, string> = {
    female: 'Aoede',
    male: 'Puck',
    teen_girl: 'Leda',
    teen_boy: 'Fenrir',
    vendor_female: 'Kore',
    vendor_male: 'Charon',
    office_female: 'Callirrhoe',
    office_male: 'Iapetus',
    aunt: 'Sulafat',
    uncle: 'Orus',
    __custom__: 'Kore',
    '': 'Kore',
  };

  return voiceMap[voiceCharacter || ''] || 'Kore';
}

export function getVoicePreviewUrl(voiceCharacter?: string): string {
  const voiceName = getVoicePreviewName(voiceCharacter);
  const sampleName = VOICE_SAMPLE_NAMES.has(voiceName) ? voiceName : 'Kore';
  return `${BACKEND_URL}/tts-samples/${encodeURIComponent(sampleName)}.wav`;
}
