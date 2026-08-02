const data=[
{name:'Produkt #1',price:'99 zł'},
{name:'Produkt #2',price:'129 zł'},
{name:'Produkt #3',price:'79 zł'},
{name:'Produkt #4',price:'149 zł'},
{name:'Produkt #5',price:'199 zł'},
{name:'Produkt #6',price:'89 zł'}
];

let cart=0;
const list=document.getElementById('products');
const count=document.getElementById('count');

data.forEach(p=>{
 const card=document.createElement('div');
 card.className='card';
 card.innerHTML=`<div class="row"><div><strong>${p.name}</strong><div class="price">${p.price}</div></div><button class="add">Dodaj</button></div>`;
 card.querySelector('button').onclick=()=>{cart++;count.textContent=cart;};
 list.appendChild(card);
});
