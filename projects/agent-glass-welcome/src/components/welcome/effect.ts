import { Skia } from '@shopify/react-native-skia';
import { SKSL } from '@/welcome/shader';

const effect = Skia.RuntimeEffect.Make(SKSL);
if (!effect) throw new Error('liquid glass shader failed to compile');

export const glassEffect = effect;
