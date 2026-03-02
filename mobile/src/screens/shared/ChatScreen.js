import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import Constants from 'expo-constants';
import api from '../../services/api';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

const BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3002';

export default function ChatScreen({ route }) {
  const { bookingId, otherPartyName, bookingStatus } = route.params;
  const { accessToken, user } = useSelector((s) => s.auth);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const socketRef = useRef(null);
  const flatListRef = useRef(null);

  // Load history
  useEffect(() => {
    loadMessages();
  }, [bookingId]);

  // Connect socket
  useEffect(() => {
    const socket = io(`${BASE_URL}/chat`, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('join:booking', bookingId);
    });

    socket.on('new_message', (msg) => {
      setMessages((prev) => {
        // Deduplicate by id
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      scrollToBottom();
    });

    socket.on('connect_error', (err) => {
      console.warn('Chat socket error:', err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.emit('leave:booking', bookingId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [bookingId, accessToken]);

  async function loadMessages() {
    try {
      const res = await api.get(`/api/messages/${bookingId}`);
      setMessages(res.data.messages || []);
    } catch (err) {
      console.warn('Failed to load messages:', err);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  async function handleSend() {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setInputText('');

    try {
      const res = await api.post(`/api/messages/${bookingId}`, { body: text });
      const newMsg = res.data.message;
      setMessages((prev) => {
        if (prev.find((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      scrollToBottom();
    } catch (err) {
      // Restore input on failure
      setInputText(text);
      console.warn('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }

  function renderMessage({ item }) {
    const isMe = item.sender_id === user?.id;
    const time = new Date(item.created_at).toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
        {!isMe && (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {item.sender_name?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
            {item.body}
          </Text>
          <Text style={[styles.timeText, isMe && styles.timeTextMe]}>{time}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {otherPartyName?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName}>{otherPartyName}</Text>
            {bookingStatus && (
              <BookingStatusBadge status={bookingStatus} />
            )}
          </View>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={scrollToBottom}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>
                Start the conversation with {otherPartyName?.split(' ')[0]}
              </Text>
            </View>
          }
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.sendBtnText}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.card,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: typography.md,
  },
  headerName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: typography.md,
    marginBottom: 2,
  },

  // Messages
  messageList: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
    flexGrow: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
    maxWidth: '80%',
  },
  bubbleRowMe: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
    marginBottom: 2,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  bubble: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    maxWidth: '100%',
  },
  bubbleMe: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
    ...shadows.card,
  },
  bubbleThem: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    ...shadows.card,
  },
  bubbleText: {
    fontSize: typography.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: colors.primary,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 3,
    textAlign: 'right',
  },
  timeTextMe: {
    color: colors.accentDark,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: spacing.sm,
  },
  emptyIcon: { fontSize: 48 },
  emptyText: {
    fontSize: typography.lg,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sm,
    color: colors.textPrimary,
    maxHeight: 100,
    minHeight: 42,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  sendBtnDisabled: {
    backgroundColor: colors.border,
  },
  sendBtnText: {
    color: colors.primary,
    fontSize: typography.md,
    fontWeight: '800',
  },
});
