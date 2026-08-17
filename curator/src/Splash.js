import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import Mark from './Mark';

const HOLD_MS = 900;
const FADE_MS = 420;

/**
 * The opening screen.
 *
 * Deliberately short and quiet: it is a breath before the tip, not a loading
 * screen. There is nothing to load — the pools ship inside the app — so this
 * exists purely to set the tone.
 */
export default function Splash({ theme, onDone }) {
  const enter = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let timer;
    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      timer = setTimeout(() => {
        Animated.timing(leave, {
          toValue: 0,
          duration: FADE_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => finished && onDone());
      }, HOLD_MS);
    });

    return () => clearTimeout(timer);
  }, [enter, leave, onDone]);

  return (
    <Animated.View
      style={[styles.fill, { backgroundColor: theme.paper, opacity: leave }]}
    >
      <Animated.View
        style={{
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        }}
      >
        <View style={styles.center}>
          <Mark size={92} ink={theme.ink} accent={theme.accent} />
          <Text style={[styles.wordmark, { color: theme.ink }]}>Art Club</Text>
          <Text style={[styles.tagline, { color: theme.muted }]}>
            One thing worth your time today.
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  wordmark: { marginTop: 30, fontSize: 34, fontWeight: '600', letterSpacing: -0.6 },
  tagline: { marginTop: 10, fontSize: 15 },
});
