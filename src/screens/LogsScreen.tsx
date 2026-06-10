import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import SectionHeader from '@/components/ui/SectionHeader';
import { logs } from '@/data/mockData';
import type { KubdeeTheme } from '@/theme/tokens';

interface LogsScreenProps {
  theme: KubdeeTheme;
}

export default function LogsScreen({ theme }: LogsScreenProps): React.JSX.Element {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-1.5 p-2">
      <SectionHeader icon={Info} theme={theme} title="Activity" />
      {logs.map((log) => {
        const Icon =
          log.level === 'success'
            ? CircleCheck
            : log.level === 'warning'
              ? CircleAlert
              : log.level === 'error'
                ? CircleX
                : Info;
        const color =
          log.level === 'success'
            ? theme.emerald
            : log.level === 'warning'
              ? theme.amber
              : log.level === 'error'
                ? theme.red
                : theme.cyan;

        return (
          <View
            key={log.id}
            className="flex-row items-center gap-2 rounded-kd-md border border-kd-border bg-kd-card p-2.5"
          >
            <Icon size={15} color={color} />
            <Text className="w-[38px] text-kd-micro font-extrabold text-kd-text-subtle">{log.timestamp}</Text>
            <Text className="flex-1 text-kd-body font-bold leading-4 text-kd-text" numberOfLines={2}>
              {log.message}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
