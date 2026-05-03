const {runtimeStore}=require('./runtimeStore');
const DEFAULT=[
{id:'frame_neon_green',category:'frame',name:'Neon Yeşil Çerçeve',price:25000,active:true,stock:null},
{id:'avatar_pm_gold',category:'avatar',name:'PM Gold Avatar',price:30000,active:true,stock:null},
{id:'profile_bg_matrix',category:'profileBackground',name:'Matrix Profil Arka Planı',price:40000,active:true,stock:null},
{id:'chat_bubble_neon',category:'chatBubble',name:'Neon Sohbet Balonu',price:15000,active:true,stock:null},
{id:'name_badge_founder',category:'nameBadge',name:'Kurucu Rozeti',price:100000,active:true,stock:null}
];
function products(){return runtimeStore.market.get('products')||DEFAULT}function setProducts(items){runtimeStore.market.set('products',items,365*86400000);return items}module.exports={products,setProducts};
