import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { Button, Field, Notice, ScreenHeader } from '../src/components/Form';
import { pickImage } from '../src/services/images';
import { BIO_MAX, getMyProfile, NICKNAME_MAX, removeProfileImage, updateMyProfile, uploadProfileImage, type MyProfile } from '../src/services/profile';

export default function EditProfile() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  return <SafeAreaView className="flex-1 bg-cream-card">
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
        <ScreenHeader title="Sửa hồ sơ" onBack={() => router.back()} />
        {session ? <Editor key={session.user.id} userId={session.user.id} />
          : <Text className="leading-7 text-stone">Đăng nhập để sửa hồ sơ.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Editor({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'avatar' | 'cover'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const load = useCallback(() => {
    const request = ++sequence.current;
    setError('');
    getMyProfile(userId).then(data => {
      if (request !== sequence.current) return;
      setProfile(data); setNickname(data.nickname); setBio(data.bio);
    }).catch(e => { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được hồ sơ.'); });
    return () => { sequence.current++; };
  }, [userId]);
  useFocusEffect(load);

  async function run(kind: 'save' | 'avatar' | 'cover', action: () => Promise<string | void>) {
    if (busy) return;
    setBusy(kind); setError(''); setNotice('');
    try { const message = await action(); if (message) setNotice(message); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể kết nối. Vui lòng thử lại.'); }
    finally { setBusy(''); }
  }
  function changeImage(kind: 'avatar' | 'cover') {
    void run(kind, async () => {
      const image = await pickImage('library');
      if (!image) return;
      const url = await uploadProfileImage(userId, kind, image);
      setProfile(p => p && (kind === 'avatar' ? { ...p, avatarUrl: url } : { ...p, coverImageUrl: url }));
      return kind === 'avatar' ? 'Đã cập nhật ảnh đại diện.' : 'Đã cập nhật ảnh bìa.';
    });
  }
  function removeImage(kind: 'avatar' | 'cover') {
    Alert.alert(kind === 'avatar' ? 'Gỡ ảnh đại diện?' : 'Gỡ ảnh bìa?', 'Bạn có thể tải ảnh mới bất cứ lúc nào.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Gỡ', style: 'destructive', onPress: () => void run(kind, async () => {
        await removeProfileImage(userId, kind);
        setProfile(p => p && (kind === 'avatar' ? { ...p, avatarUrl: null } : { ...p, coverImageUrl: null }));
        return 'Đã gỡ ảnh.';
      }) },
    ]);
  }

  if (!profile) return error ? <><Notice message={error} /><Button label="Thử lại" secondary onPress={load} /></>
    : <ActivityIndicator color="#143b4d" style={{ marginTop: 32 }} />;
  const nicknameTrimmed = nickname.trim();
  const changed = nicknameTrimmed !== profile.nickname || bio !== profile.bio;
  const nicknameError = !nicknameTrimmed ? 'Nickname không được để trống.' : undefined;

  return <>
    <Text className="mb-2 font-bold text-brand-ink">Ảnh bìa</Text>
    <View className="mb-2 overflow-hidden rounded-2xl border border-cream-border bg-cream" style={{ aspectRatio: 3 }}>
      {profile.coverImageUrl && <Image source={{ uri: profile.coverImageUrl }} accessibilityLabel="Ảnh bìa" style={{ width: '100%', height: '100%' }} resizeMode="cover" />}
    </View>
    <View className="flex-row gap-3">
      <View className="flex-1"><Button label={busy === 'cover' ? 'Đang tải…' : 'Đổi ảnh bìa'} secondary disabled={!!busy} onPress={() => changeImage('cover')} /></View>
      {profile.coverImageUrl && <View className="flex-1"><Button label="Gỡ ảnh bìa" secondary disabled={!!busy} onPress={() => removeImage('cover')} /></View>}
    </View>

    <Text className="mb-2 mt-6 font-bold text-brand-ink">Ảnh đại diện</Text>
    <View className="flex-row items-center gap-4">
      <View className="h-24 w-24 overflow-hidden rounded-full border border-cream-border bg-cream">
        {profile.avatarUrl && <Image source={{ uri: profile.avatarUrl }} accessibilityLabel="Ảnh đại diện" style={{ width: '100%', height: '100%' }} />}
      </View>
      <View className="flex-1">
        <Button label={busy === 'avatar' ? 'Đang tải…' : 'Đổi ảnh đại diện'} secondary disabled={!!busy} onPress={() => changeImage('avatar')} />
        {profile.avatarUrl && <Button label="Gỡ ảnh đại diện" secondary disabled={!!busy} onPress={() => removeImage('avatar')} />}
      </View>
    </View>

    <View className="mt-6">
      <Field label="Tên tài khoản" value={`@${profile.username}`} editable={false} hint="Không đổi được tên tài khoản." />
      <Field label="Nickname" value={nickname} onChangeText={setNickname} editable={!busy} maxLength={NICKNAME_MAX}
        hint="Sau khi đổi, cần chờ 30 ngày mới đổi lại được." error={nicknameError} />
      <Field label={`Giới thiệu (${bio.length}/${BIO_MAX})`} value={bio} onChangeText={v => setBio(v.slice(0, BIO_MAX))} editable={!busy}
        multiline textAlignVertical="top" style={{ minHeight: 120 }} />
    </View>
    <Button label={busy === 'save' ? 'Đang lưu…' : 'Lưu thay đổi'} disabled={!!busy || !changed || !!nicknameError}
      onPress={() => void run('save', async () => {
        const result = await updateMyProfile(userId, { nickname: nicknameTrimmed, bio });
        setProfile(p => p && { ...p, nickname: result.nickname, bio });
        setNickname(result.nickname);
        return 'Đã lưu hồ sơ.';
      })} />
    <Notice message={error} />
    <Notice message={notice} tone="success" />
  </>;
}
