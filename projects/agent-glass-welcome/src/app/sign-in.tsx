import { Text, useColorScheme, View } from 'react-native';
import { dark, light } from '@/welcome/theme';

// Placeholder: sign-in is a short interruption, so it is a form sheet over the
// welcome screen (drag to dismiss), not a pushed route.
export default function SignIn() {
  const pal = useColorScheme() === 'dark' ? dark : light;
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 32, gap: 8, backgroundColor: pal.bg }}>
      <Text style={{ fontSize: 22, fontWeight: '600', color: pal.ink }}>Welcome back</Text>
      <Text style={{ fontSize: 17, color: pal.secondary }}>Sign-in options go here.</Text>
    </View>
  );
}
