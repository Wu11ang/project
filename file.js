// const numberOfFilms = +prompt("Сколько фильмов уже посмотрели?", "");

// const personalMovieDB = {
//     count: numberOfFilms,
//     movies: {},
//     actors: {},
//     genres: [],
//     privat: false
// };

// const a = prompt("Один из последних просмотренных фильмов?", "");
// const b = prompt("На сколько оцените его?", "");

// const c = prompt("Один из последних просмотренных фильмов?", "");
// const d = prompt("На сколько оцените его?", "");

// personalMovieDB.movies[a] = b;
// personalMovieDB.movies[c] = d;

// console.log(personalMovieDB);
// if (1) {
//     console.log("ok!");
// } else {
//     console.log("error")
// };

// const num =60;

// if (num < 49) {
//     console.log("error")
// }else if (num >100){ 
//     console.log('много');
// } else {
//     console.log('ok')
// };



// const num =60;
// switch (num) {
//     case 49:
//     console.log('neverno');
//     break;
//     case 100:
//     console.log('neverno');
//     break;case 60:
//     console.log('pravda');
//     break;
//     default:
//         console.log("ne ugadal");
//         break;
// };


// const hamburg = true; 
// const fries = true;
// if (hamburg && fries) {
//     console.log("я сыт")
// }

// const hamburg = 3; 
// const fries = 2;
// const cola = 0
// console.log(hamburg ===3 && cola  && fries)


// if (hamburg ===3 && cola ===1 && fries) {
//     console.log("все сыты");
// } else { console.log("мы уходим")
// }



// const hamburg = 0; 
// const fries = 0;
// const cola = 0
// // console.log(hamburg ||  cola  || fries)


// if (cola ||  hamburg || fries) {
//     console.log("довольны");
// } else { console.log("мы уходим")
// }


// const hamburg = 0; 
// const fries = 1;
// const cola = 3
// const nagets = 0;
// // console.log(hamburg ||  cola  || fries)


// if (cola ===3 && hamburg ===2 || fries ===2 && nagets ===1 ) {
//     console.log("довольны");
// } else { console.log("мы уходим")
// }


// console.log( NaN || 2 || undefined );
// console.log( NaN && 2 && undefined );
// console.log( 1 && 2 && 3 );
// console.log( !1 && 2 || !3 );
// console.log( 25 || null && !3 );


// console.log( NaN || null && !3 && undefined || 5);


// console.log( 5 === 5 && 3 > 1 || 5);

// const hamburger = 3;
// const fries = 3;
// const cola = 0;
// const nuggets = 2;


// if (hamburger === 3 && cola || fries === 3 && nuggets) {
//    console.log('Done!')
// }



// const hamburger;
// const fries = NaN;
// const cola = 0;
// const nuggets = 2;


// if (hamburger || cola || fries === 3 || nuggets) {
//    console.log('Done!')
// }

// let hamburger;
// const fries = NaN;
// const cola = 0;
// const nuggets = 2;

// console.log(fries === 3 && nuggets)

// if (hamburger && cola || fries === 3 && nuggets) {
//    console.log('Done!')
// }

let num = 50 

while (num<= 55) {
    console.log(num);
    num++;

// }
do {  console.log(num);
    num++;

}
while (num<= 55)

    let num = 50 

for (let i=1; i <8; i++) {
    console.log(num);
    num++;
}

for ( let i =1; i<10; i++ ) {
    if(i === 6) {
        // break;
        continue;
    }
    console.log(i);
}


for (let hour = 0; hour <= 3; hour++) {   
    console.log(hour)   // внешний цикл
  for (let min = 0; min < 60; min++) {       // внутренний цикл
    console.log( min);
  }
}

let result ='';
const length =7;
for (let i=1; i < length; i++) {
    for (let j = 0; j < i; j++){
        result +="*"
    }
    result +='\n'
}
console.log(result);



function secondTask() {
    
    for (let i=20; i>10; i--){
        
    if(i === 13) {
        break;
    }
    console.log (i)
}
}

for (let i = 2; i < 10; i++){
if (i % 2 === 0)
    console. log (i)
}



 for (let i = 2; i <= 16; i++) {
     if (i % 2 === 0) {
         continue;
     } else {
         console.log(i);
     }
 }

let num = 2;

while (num <= 16) {
    if (num % 2 !== 0) {
        console.log(num);
    }
    num++;
}




    for (let i = 0; i < arr.length; i++) {
        result[i] = arr[i];
    }

    console.log(result);
    return result;
}



