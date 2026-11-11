import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {useAppPalette} from '../../theme';
import {
  defaultMatchPreferences, fallbackBreedCatalog, fetchBreedCatalog,
  getMatchNotifications, getMatchPreferences, PetMatchNotification, PetMatchPreference,
  readMatchNotification, saveMatchPreferences,
} from '../../api/phase422';

const COLORS=['','Black','White','Brown','Cream','Gray','Orange','Golden','Tan','Ginger','Calico','Tortoiseshell','Tabby','Brindle','Spotted','Mixed','Other / Unknown'];

export default function AdoptionMatchesPanel({visible,onClose,onOpenListing}:{
  visible:boolean;
  onClose:()=>void;
  onOpenListing:(listingId:string)=>void;
}) {
  const colors=useAppPalette();
  const [prefs,setPrefs]=useState<PetMatchPreference>(defaultMatchPreferences);
  const [notifications,setNotifications]=useState<PetMatchNotification[]>([]);
  const [breeds,setBreeds]=useState<string[]>(fallbackBreedCatalog.Dog);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [ageMin,setAgeMin]=useState('0');
  const [ageMax,setAgeMax]=useState('40');
  const setPreference=<K extends keyof PetMatchPreference>(key:K,value:PetMatchPreference[K])=>setPrefs(current=>({...current,[key]:value}));
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const [saved,notes] = await Promise.all([getMatchPreferences(),getMatchNotifications()]);
      setPrefs(saved);setAgeMin(String(saved.minAgeYears));setAgeMax(String(saved.maxAgeYears));setNotifications(notes);
    } catch(e:any){setError(e?.message||'Unable to load your adoption preferences.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{if(visible)load();},[visible,load]);
  useEffect(()=>{
    if(!visible)return;
    if(prefs.species==='Any'){setBreeds([]);return;}
    let current=true;
    setBreeds(fallbackBreedCatalog[prefs.species]);
    fetchBreedCatalog(prefs.species).then(list=>{
      if(current && list.length)setBreeds(list);
    }).catch(()=>{});
    return()=>{current=false;};
  },[prefs.species,visible]);
  const save=async()=>{
    setBusy(true);
    try {
      const min=Number(ageMin),max=Number(ageMax);
      if(!/^\d+$/.test(ageMin)||!/^\d+$/.test(ageMax)||!Number.isInteger(min)||!Number.isInteger(max))
        throw new Error('Please use whole numbers for both age limits.');
      const updated={...prefs,minAgeYears:min,maxAgeYears:max};
      await saveMatchPreferences(updated);
      setPrefs(updated);
      Alert.alert('Preferences saved','New matching adoption listings will create private in-app notifications. Existing listings are not backfilled.');
    }catch(e:any){Alert.alert('Unable to save',e?.message||'Check your input and retry.');}
    finally{setBusy(false);}
  };
  const openNote=async(note:PetMatchNotification)=>{
    if(!note.isRead){
      try {await readMatchNotification(note.$id);setNotifications(previous=>previous.map(n=>n.$id===note.$id?{...n,isRead:true}:n));}
      catch(e:any){Alert.alert('Could not mark as read',e?.message||'Please retry.');}
    }
    onOpenListing(note.listingId);
  };
  const box={backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:13,padding:12,marginBottom:12} as const;
  const label=(value:string)=><Text style={{color:colors.text,fontSize:13,fontWeight:'700',marginBottom:5}}>{value}</Text>;
  const picker=(value:string,options:string[],onChange:(v:string)=>void)=><View style={box}><Picker selectedValue={value} onValueChange={onChange} style={{color:colors.text}}>
    {options.map(option=><Picker.Item key={option} label={option||'Any'} value={option}/>)}</Picker></View>;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
    <View style={{flex:1,backgroundColor:colors.background,paddingTop:22}}>
      <View style={{paddingHorizontal:17,paddingBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
        <Text style={{fontSize:21,color:colors.text,fontWeight:'800'}}>Adoption matching</Text>
        <TouchableOpacity accessibilityRole="button" onPress={onClose}><Text style={{color:colors.primary,fontWeight:'700'}}>Close</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{padding:17,paddingBottom:55}} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/> }>
        <Text style={{color:colors.secondary,marginBottom:16,lineHeight:20}}>Choose what kind of pet you are looking for. Only new listings matching all selected preferences trigger an alert.</Text>
        {!!error&&<Text style={{color:'#B91C1C',marginBottom:12}}>{error}</Text>}
        {label('Pet type')}
        {picker(prefs.species,['Any','Dog','Cat'],v=>setPrefs(curr=>({...curr,species:v as PetMatchPreference['species'],breed:''})))}
        {label('Breed')}
        {prefs.species==='Any'?<Text style={{color:colors.secondary,marginBottom:13}}>Choose Dog or Cat first to filter by breed.</Text>:
          picker(prefs.breed,['',...new Set([...breeds,prefs.breed].filter(Boolean))],v=>setPreference('breed',v))}
        {label('Coat color')}
        {picker(prefs.color,[...new Set([...COLORS,prefs.color].filter((x,i,a)=>a.indexOf(x)===i))],v=>setPreference('color',v))}
        {label('Sex')}
        {picker(prefs.sex,['Any','Male','Female'],v=>setPreference('sex',v as PetMatchPreference['sex']))}
        <View style={{flexDirection:'row',gap:10,marginBottom:14}}>
          <View style={{flex:1}}>{label('Minimum age (years)')}
            <TextInput keyboardType="number-pad" maxLength={2} value={ageMin} onChangeText={setAgeMin} style={[box,{color:colors.text,marginBottom:0}]}/></View>
          <View style={{flex:1}}>{label('Maximum age (years)')}
            <TextInput keyboardType="number-pad" maxLength={2} value={ageMax} onChangeText={setAgeMax} style={[box,{color:colors.text,marginBottom:0}]}/></View>
        </View>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <Text style={{color:colors.text,fontWeight:'700',flex:1}}>Enable adoption matching</Text>
          <Switch value={prefs.isEnabled} onValueChange={v=>setPreference('isEnabled',v)}/>
        </View>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <Text style={{color:colors.text,fontWeight:'700',flex:1}}>Request push notifications</Text>
          <Switch value={prefs.pushEnabled} onValueChange={v=>setPreference('pushEnabled',v)}/>
        </View>
        <Text style={{color:colors.secondary,fontSize:11,marginBottom:15}}>In-app alerts work independently. Android push additionally requires an installed development build, notification permissions, and an Appwrite Messaging provider/registered device target.</Text>
        <TouchableOpacity accessibilityRole="button" disabled={busy||loading} onPress={save} style={{backgroundColor:colors.primary,borderRadius:12,padding:14,alignItems:'center',marginBottom:22,opacity:busy?.6:1}}>
          <Text style={{color:'#FFFFFF',fontWeight:'800'}}>{busy?'Saving...':'Save my preferences'}</Text>
        </TouchableOpacity>
        <Text style={{color:colors.text,fontSize:19,fontWeight:'800',marginBottom:10}}>My match notifications ({notifications.filter(n=>!n.isRead).length} unread)</Text>
        {!notifications.length && !loading && <Text style={{color:colors.secondary,marginBottom:12}}>No matching adoption alerts yet.</Text>}
        {notifications.map(note=><TouchableOpacity key={note.$id} accessibilityRole="button" onPress={()=>openNote(note)} style={[box,{borderLeftWidth:4,borderLeftColor:note.isRead?colors.border:colors.primary}]}>
          <Text style={{color:colors.text,fontSize:14,fontWeight:note.isRead?'500':'800'}}>{note.title||note.petName||'Matching pet'}</Text>
          <Text style={{color:colors.secondary,fontSize:12,marginTop:5}}>{new Date(note.createdAt||Date.now()).toLocaleString()} · {note.isRead?'Read':'New'}</Text>
          <Text style={{color:colors.primary,fontSize:12,marginTop:6}}>Open matching adoption listing ›</Text>
        </TouchableOpacity>)}
      </ScrollView>
    </View>
  </Modal>;
}
