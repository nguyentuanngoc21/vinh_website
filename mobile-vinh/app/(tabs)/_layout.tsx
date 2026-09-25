import { Tabs } from 'expo-router';
import { BottomTabBar } from 'expo-router/js-tabs';
import { Text, View } from 'react-native';
import { MiniPlayer } from '../../src/components/MiniPlayer';
const tabs = [
  ['index', 'Trang chủ', '⌂'], ['tu-sach', 'Tủ sách', '▤'],
  ['audio', 'Audio', '♫'], ['ca-nhan', 'Cá nhân', '○'],
] as const;
export default function TabLayout() {
  return <Tabs tabBar={props => <View><MiniPlayer /><BottomTabBar {...props} /></View>} screenOptions={{ headerShown: false, tabBarActiveTintColor: '#143b4d',
    tabBarInactiveTintColor: '#8a8178', tabBarStyle: { backgroundColor: '#fbf7ec' } }}>
    {tabs.map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title,
      tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 26 }}>{icon}</Text> }} />)}
  </Tabs>;
}
