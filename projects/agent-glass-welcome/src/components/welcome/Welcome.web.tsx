import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// On web, Skia runs on CanvasKit (WebAssembly). The screen module is imported
// only after CanvasKit has loaded, because it compiles the shader at import.
export default function Welcome() {
  return (
    <WithSkiaWeb opts={{ locateFile: (file: string) => `/${file}` }} getComponent={() => import('./WelcomeScreen')} />
  );
}
