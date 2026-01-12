const numberOfFilms = +prompt("Сколько фильмов уже посмотрели?", "");

const personalMovieDB = {
    count: numberOfFilms,
    movies: {},
    actors: {},
    genres: [],
    privat: false
};


// 1) Автоматизировать вопросы пользователю про фильмы при помощи цикла

// 2) Сделать так, чтобы пользователь не мог оставить ответ в виде пустой строки,
// отменить ответ или ввести название фильма длинее, чем 50 символов. Если это происходит - 
// возвращаем пользователя к вопросам опять

for (let i = 0; i < 2; i++) {
    const a = prompt("Один из последних просмотренных фильмов?", "");
    const b = prompt("На сколько оцените его?", "");

    if (
        a !== null &&
        b !== null &&
        a !== "" &&
        b !== "" &&
        a.length < 50
    ) {
        personalMovieDB.movies[a] = b;
        console.log('done');
    } else {
        console.log('error');
        i--;
    }
}

if (personalMovieDB.count < 10){
    console.log ('Просмотрено довольно мало фильмов')
} else if (personalMovieDB.count >=10 && personalMovieDB.count < 30) {
    console.log ( 'Вы классический зритель')

}else if ( personalMovieDB.count >=30){
    console.log('Вы киноман')
} else {
    console.log ('Произошла ошибка')
}

console.log(personalMovieDB);
