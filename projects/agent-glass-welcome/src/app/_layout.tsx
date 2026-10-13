import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from 'react-native';
import { dark, light } from '@/welcome/theme';

// Keep the spark splash up until the welcome screen has its fonts + images;
// the screen hides it and continues the same spark in the same spot.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 150 });

export default function RootLayout() {
  const pal = useColorScheme() === 'dark' ? dark : light;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: pal.bg }}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: pal.bg }, headerTintColor: pal.ink }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: 'Get started', headerBackTitle: 'Welcome' }} />
        <Stack.Screen
          name="sign-in"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.5],
            sheetGrabberVisible: true,
            headerShown: false,
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
