// ================== TYPES IN JAVASCRIPT ==================

// Number — числа
let age = 20;
let price = 9.99;

// String — строки
let name = "Rus";
let city = 'Astana';

// Boolean — логический тип
let isOpen = true;
let isClosed = false;

// Null — "ничего", пусто (осознанно задано пустое значение)
let car = null;

// Undefined — значение не задано
let user;
console.log(user); // undefined

// Symbol — уникальное значение (редко используется)
let id = Symbol("userId");

// BigInt — очень большие числа
let bigNumber = 12345678901234567890n;


// ================== NON-PRIMITIVE ==================

// Object — объект
let person = {
  name: "Rus",
  age: 20
};

// Array — массив
let employees = ["Ali", "Rus", "Tim"];

// Function — функция
function sayHi() {
  console.log("Hi");
}
