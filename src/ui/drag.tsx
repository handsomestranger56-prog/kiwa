import { type ComponentRef, type ReactNode, createContext, use, useEffect, useRef, useState } from 'react';
import { type StyleProp, type ViewStyle, Animated, PanResponder, View } from 'react-native';

type ViewHandle = ComponentRef<typeof View>;

type Registry = {
  register: (id: string, view: ViewHandle) => () => void;
  /** The id of the drop zone under a point on the screen, if any. */
  zoneAt: (x: number, y: number) => Promise<string | null>;
};

const DragContext = createContext<Registry | null>(null);

/** Wrap the draggable items and the places they can be dropped in one of these. */
export function DragArea({ children }: { children: ReactNode }) {
  const [registry] = useState<Registry>(() => {
    const zones = new Map<string, ViewHandle>();
    return {
      register(id, view) {
        zones.set(id, view);
        return () => {
          if (zones.get(id) === view) zones.delete(id);
        };
      },
      async zoneAt(x, y) {
        const hits = await Promise.all(
          [...zones.entries()].map(
            ([id, view]) =>
              new Promise<string | null>((resolve) => {
                view.measureInWindow((left, top, width, height) => {
                  resolve(x >= left && x <= left + width && y >= top && y <= top + height ? id : null);
                });
              }),
          ),
        );
        return hits.find((hit) => hit !== null) ?? null;
      },
    };
  });
  return <DragContext value={registry}>{children}</DragContext>;
}

type ZoneProps = { id: string; children: ReactNode; style?: StyleProp<ViewStyle> };

export function DropZone({ id, children, style }: ZoneProps) {
  const registry = use(DragContext);
  const view = useRef<ViewHandle>(null);

  useEffect(() => {
    if (!registry || !view.current) return;
    return registry.register(id, view.current);
  }, [registry, id]);

  return (
    <View ref={view} collapsable={false} style={style}>
      {children}
    </View>
  );
}

type DraggableProps = {
  children: ReactNode;
  /** Called with the zone the item was released over. */
  onDrop: (zoneId: string) => void;
  /** Called when the item is pressed without being moved. */
  onTap?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** How far a press may travel and still count as a tap. */
const TAP_SLOP = 6;

/**
 * An item that follows the finger and reports where it was let go.
 * Built on PanResponder, which behaves the same on iOS, Android and the web.
 */
export function Draggable({ children, onDrop, onTap, disabled = false, style }: DraggableProps) {
  const registry = use(DragContext);
  const [offset] = useState(() => new Animated.ValueXY());
  const [dragging, setDragging] = useState(false);

  // The responder is created once, so it reads the current handlers through this ref.
  const latest = useRef({ onDrop, onTap, disabled, registry });
  useEffect(() => {
    latest.current = { onDrop, onTap, disabled, registry };
  });

  // The handlers below read the ref only when a gesture event fires, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      // A scroll view must not take the gesture away halfway through a drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: (_, gesture) => offset.setValue({ x: gesture.dx, y: gesture.dy }),
      onPanResponderRelease: (_, gesture) => {
        setDragging(false);
        offset.setValue({ x: 0, y: 0 });
        const current = latest.current;
        if (Math.abs(gesture.dx) + Math.abs(gesture.dy) < TAP_SLOP) {
          current.onTap?.();
          return;
        }
        void current.registry?.zoneAt(gesture.moveX, gesture.moveY).then((zone) => {
          if (zone !== null) latest.current.onDrop(zone);
        });
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        offset.setValue({ x: 0, y: 0 });
      },
    }),
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[style, { transform: offset.getTranslateTransform() }, dragging && { zIndex: 10, opacity: 0.85 }]}>
      {children}
    </Animated.View>
  );
}
