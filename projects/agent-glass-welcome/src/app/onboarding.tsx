import { ScrollView, Text, useColorScheme } from 'react-native';
import { dark, light } from '@/welcome/theme';

// Placeholder for the next step. Pushed (not replaced): going back to the
// welcome screen is fine until the user has actually signed in.
export default function Onboarding() {
  const pal = useColorScheme() === 'dark' ? dark : light;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 17, color: pal.secondary }}>Onboarding continues here.</Text>
    </ScrollView>
  );
}
